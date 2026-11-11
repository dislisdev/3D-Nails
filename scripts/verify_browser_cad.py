#!/usr/bin/env python3
"""Independently import browser-generated STEP/STL with OpenCascade/trimesh.

This development verification does not run in the deployed static browser app.
Run test_browser_geometry.mjs first and pass its artifact directory here.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh


def verify(folder: Path) -> None:
    result = json.loads((folder / "model.json").read_text())
    viewer = trimesh.Trimesh(**result["mesh"], process=True)
    stl = trimesh.load_mesh(folder / "model.stl", process=True)
    solid = cq.importers.importStep(str(folder / "model.step")).val()
    assert solid.isValid(), f"{folder.name}: OpenCascade rejects the STEP solid"
    assert len(solid.Solids()) == 1, f"{folder.name}: expected exactly one imported solid"
    assert viewer.is_watertight and stl.is_watertight
    assert viewer.is_volume and stl.is_volume
    assert abs(solid.Volume() - viewer.volume) / viewer.volume < 1e-6
    assert abs(stl.volume - viewer.volume) / viewer.volume < 1e-6
    assert np.max(np.abs(stl.bounds - viewer.bounds)) < 1e-6
    bounds = solid.BoundingBox()
    step_bounds = np.array([[bounds.xmin, bounds.ymin, bounds.zmin], [bounds.xmax, bounds.ymax, bounds.zmax]])
    assert np.max(np.abs(step_bounds - viewer.bounds)) < 1e-5
    # Importing a FACETED_BREP must retain planar triangular faces. This is
    # intentionally distinct from the smooth B-spline backend CAD engine.
    assert len(solid.Faces()) == len(result["mesh"]["faces"])
    assert all(face.geomType() == "PLANE" for face in solid.Faces())
    print(f"PASS independent CAD import: {folder.name}; valid single solid; volume={solid.Volume():.6f} mm³")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/verify_browser_cad.py <browser-fixture-directory>")
    folders = sorted(path.parent for path in Path(sys.argv[1]).glob("*/model.json"))
    if not folders:
        raise SystemExit("No browser CAD fixtures found; zero checks would not validate the runtime.")
    for folder in folders:
        verify(folder)
    print(f"{len(folders)} independent STEP/STL/viewer import comparisons passed.")
