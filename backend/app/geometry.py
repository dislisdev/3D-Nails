"""Independent, millimetre-based CAD generation for non-wearable research shells.

No legacy N01–N05 assets were available during implementation.  This module is
therefore a new, explicit parametric approximation, not a reconstruction of those
assets or of the full photographed nail surface.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import cadquery as cq
import numpy as np
import trimesh


NUMERIC_BOUNDS = {
    "length_mm": (4.0, 40.0),
    "width_mm": (3.0, 30.0),
    "transverse_rise_mm": (0.0, 6.0),
    "longitudinal_rise_mm": (0.0, 4.0),
    "thickness_mm": (0.25, 1.5),
    "extension_mm": (0.0, 15.0),
    "asymmetry_mm": (-2.0, 2.0),
}

GEOMETRY_LIMITATIONS = [
    "A parametric approximation from projected length/width and manual inputs; "
    "the photographic contour is not reconstructed as a 3D contact surface.",
    "Outer surface approximates a sampled surface-normal offset. Thickness "
    "checks sample surface separation, not a proof of global minimum thickness.",
    "OpenCascade validity and mesh topology are checked. An independent global "
    "triangle self-intersection test is not implemented.",
    "No fastening allowance, printer compensation, material suitability or "
    "physical fit has been validated. Non-wearable laboratory prototype only.",
]


def validate_parameters(parameters: dict[str, Any]) -> dict[str, Any]:
    """Validate physical ranges without silently clamping user inputs."""
    result: dict[str, Any] = {}
    for name, (low, high) in NUMERIC_BOUNDS.items():
        value = parameters.get(name)
        if isinstance(value, bool):
            raise ValueError(f"{name} must be a finite number in millimetres.")
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"{name} is required and must be a finite number.") from None
        if not math.isfinite(number) or not low <= number <= high:
            raise ValueError(f"{name} must be between {low:g} and {high:g} mm.")
        result[name] = number

    if result["transverse_rise_mm"] > 0.45 * result["width_mm"]:
        raise ValueError("Transverse rise must not exceed 45% of width in this engine.")
    if abs(result["asymmetry_mm"]) > min(2.0, result["width_mm"] * 0.15):
        raise ValueError("Asymmetry must not exceed 15% of width (maximum 2 mm).")
    tip = parameters.get("tip_shape")
    if tip not in {"oval", "squoval", "almond"}:
        raise ValueError("tip_shape must be oval, squoval or almond.")
    result["tip_shape"] = tip
    return result


def _surface_point(u: float, v: float, p: dict[str, Any]) -> np.ndarray:
    """Inner surface, with u across the nail and v from cuticle to free edge.

    The proximal and distal boundaries bow in plan view.  Section width changes
    continuously, while both transverse and longitudinal rises describe the
    inner surface and remain independent of shell thickness.
    """
    length = p["length_mm"] + p["extension_mm"]
    width = p["width_mm"]
    tail = {"oval": 0.62, "squoval": 0.90, "almond": 0.22}[p["tip_shape"]]
    if v <= 0.45:
        section_width = width * (0.72 + 0.28 * math.sin(math.pi * v / 0.90))
    else:
        taper = (v - 0.45) / 0.55
        easing = 3.0 * taper**2 - 2.0 * taper**3
        section_width = width * (1.0 - (1.0 - tail) * easing)

    # These bounds preserve an injective planar mapping, including flat shells.
    # Combining an aggressive width taper with a deep distal bow can fold the
    # parameter domain, even when a curved surface hides that fault visually.
    cuticle_bow = min(0.07 * length, 0.10 * width)
    distal_bow = min(0.06 * length, 0.12 * width * tail)
    if p["tip_shape"] == "squoval":
        distal_bow *= 0.25
    x = u * section_width / 2.0 + p["asymmetry_mm"] * math.sin(math.pi * v)
    y = length * v + cuticle_bow * (1.0 - v) ** 3 * u**2 - distal_bow * v**3 * u**2
    z = (
        p["transverse_rise_mm"] * (1.0 - u**2) * (0.85 + 0.15 * math.sin(math.pi * v))
        + p["longitudinal_rise_mm"] * math.sin(math.pi * v)
    )
    return np.array([x, y, z], dtype=float)


def _normal(u: float, v: float, p: dict[str, Any]) -> np.ndarray:
    delta = 1e-5
    du = (_surface_point(u + delta, v, p) - _surface_point(u - delta, v, p)) / (2 * delta)
    dv = (_surface_point(u, v + delta, p) - _surface_point(u, v - delta, p)) / (2 * delta)
    normal = np.cross(du, dv)
    magnitude = float(np.linalg.norm(normal))
    if not math.isfinite(magnitude) or magnitude < 1e-8 or normal[2] <= 0:
        raise ValueError("Degenerate surface for these design parameters.")
    return normal / magnitude


def _make_solid(p: dict[str, Any]) -> tuple[cq.Solid, cq.Face, cq.Face]:
    # Samples are fitted with a tolerance of 0.001 mm; the outer sample points
    # are displaced along the local surface normal, never by a fixed z amount.
    us, vs = np.linspace(-1.0, 1.0, 19), np.linspace(0.0, 1.0, 29)
    inner_grid = [
        [cq.Vector(*_surface_point(u, v, p)) for v in vs] for u in us
    ]
    outer_grid = [
        [
            cq.Vector(*(_surface_point(u, v, p) + p["thickness_mm"] * _normal(u, v, p)))
            for v in vs
        ]
        for u in us
    ]
    inner = cq.Face.makeSplineApprox(inner_grid, tol=0.001, minDeg=3, maxDeg=6)
    outer = cq.Face.makeSplineApprox(outer_grid, tol=0.001, minDeg=3, maxDeg=6)
    faces: list[cq.Face] = [inner, outer]
    remaining_edges = list(outer.Edges())
    for edge in inner.Edges():
        paired = min(remaining_edges, key=lambda e: (e.Center() - edge.Center()).Length)
        remaining_edges.remove(paired)
        direct = (edge.startPoint() - paired.startPoint()).Length + (
            edge.endPoint() - paired.endPoint()
        ).Length
        crossed = (edge.startPoint() - paired.endPoint()).Length + (
            edge.endPoint() - paired.startPoint()
        ).Length
        if direct > crossed:
            paired = cq.Edge(paired.wrapped.Reversed())
        faces.append(cq.Face.makeRuledSurface(edge, paired))
    shell = cq.Shell.makeShell(faces)
    solid = cq.Solid.makeSolid(shell).fix()
    return solid, inner, outer


def _sample_separation(inner: cq.Face, outer: cq.Face, p: dict[str, Any]) -> dict[str, Any]:
    distances = []
    for u in np.linspace(-0.85, 0.85, 5):
        for v in np.linspace(0.10, 0.90, 7):
            position = _surface_point(float(u), float(v), p)
            surface_uv = inner.paramAt(cq.Vector(*position))
            projected = inner.positionAt(*surface_uv)
            vertex = cq.Vertex.makeVertex(*projected.toTuple())
            distances.append(vertex.distance(outer))
    return {
        "sample_count": len(distances),
        "minimum_mm": round(min(distances), 6),
        "maximum_mm": round(max(distances), 6),
        "nominal_mm": p["thickness_mm"],
        "method": "Nearest outer-face distance at 35 interior points projected onto the inner face.",
        "global_minimum_verified": False,
    }


def generate_geometry(parameters: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    """Create and validate one CAD solid, its STL/STEP and the viewer mesh.

    A failed mandatory topology or round-trip check raises ValueError; files
    from a rejected model are removed rather than offered as successful output.
    The caller owns unique generation directories and persistence/authorization.
    """
    p = validate_parameters(parameters)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    generated_paths = [output_dir / name for name in (
        "model.stl", "model.step", "parameters.json", "validation.json"
    )]
    try:
        solid, inner, outer = _make_solid(p)
        volume = float(solid.Volume())
        bbox = solid.BoundingBox()
        raw_vertices, faces = solid.tessellate(0.025, 0.10)
        mesh = trimesh.Trimesh(
            vertices=np.array([v.toTuple() for v in raw_vertices]),
            faces=np.array(faces, dtype=np.int64),
            process=True,
        )
        # ShapeFix orients the BRep. Trimesh checks, rather than silently repairs,
        # the exported tessellation so topology failures remain visible.
        separation = _sample_separation(inner, outer, p)
        checks = {
            "valid_solid": bool(solid.isValid() and len(solid.Solids()) == 1),
            "watertight_mesh": bool(mesh.is_watertight),
            "nonzero_volume": bool(volume > 1e-5 and mesh.volume > 1e-5),
            "consistent_normals": bool(mesh.is_winding_consistent and mesh.is_volume),
            "finite_mesh": bool(np.isfinite(mesh.vertices).all()),
            "nondegenerate_triangles": bool((mesh.area_faces > 1e-12).all()),
            "sampled_thickness": bool(
                separation["minimum_mm"] >= p["thickness_mm"] * 0.75
                and separation["maximum_mm"] <= p["thickness_mm"] * 1.25
            ),
            "expected_dimensions": bool(
                p["width_mm"] * 0.7 <= bbox.xlen <= p["width_mm"] + 2 * p["thickness_mm"] + 2 * abs(p["asymmetry_mm"]) + 0.2
                and p["length_mm"] + p["extension_mm"] - 0.2 <= bbox.ylen
                <= p["length_mm"] + p["extension_mm"] + 2 * p["thickness_mm"] + 0.2
            ),
        }
        if not all(checks.values()):
            failed = ", ".join(name for name, result in checks.items() if not result)
            raise ValueError(f"Generated geometry failed validation: {failed}.")

        cq.exporters.export(solid, str(output_dir / "model.step"))
        mesh.export(str(output_dir / "model.stl"), file_type="stl")

        step_solid = cq.importers.importStep(str(output_dir / "model.step")).val()
        step_volume = float(step_solid.Volume())
        checks["step_roundtrip"] = bool(
            step_solid.isValid()
            and len(step_solid.Solids()) == 1
            and abs(step_volume - volume) / volume < 1e-5
        )
        stl_mesh = trimesh.load_mesh(output_dir / "model.stl", file_type="stl", process=True)
        checks["stl_roundtrip"] = bool(
            stl_mesh.is_watertight
            and stl_mesh.is_winding_consistent
            and stl_mesh.volume > 0
            and abs(float(stl_mesh.volume) - float(mesh.volume)) / float(mesh.volume) < 1e-4
            and np.max(np.abs(stl_mesh.bounds - mesh.bounds)) < 1e-4
        )
        checks["mesh_brep_volume_agreement"] = bool(abs(float(mesh.volume) - volume) / volume < 0.03)
        if not all(checks.values()):
            failed = ", ".join(name for name, result in checks.items() if not result)
            raise ValueError(f"Exported geometry failed validation: {failed}.")

        metadata = {
            "units": "mm",
            "engine": "CadQuery / OpenCascade parametric shell V1",
            "geometry_kind": "parametric_approximation",
            "wearable": False,
            "fit_validated": False,
            "solid_count": len(solid.Solids()),
            "volume_mm3": round(volume, 6),
            "mesh_volume_mm3": round(float(mesh.volume), 6),
            "surface_area_mm2": round(float(solid.Area()), 6),
            "dimensions_mm": {"x": round(bbox.xlen, 6), "y": round(bbox.ylen, 6), "z": round(bbox.zlen, 6)},
            "vertex_count": len(mesh.vertices),
            "triangle_count": len(mesh.faces),
            "thickness_definition": "Outer B-spline fitted to inner surface samples displaced along their local normal.",
            "sampled_surface_separation": separation,
            "tessellation_linear_tolerance_mm": 0.025,
            "tessellation_angular_tolerance_radians": 0.10,
            "fastening_allowance_mm": 0.0,
            "landmarks_mm": {
                "cuticle": _surface_point(0.0, 0.0, p).tolist(),
                "distal": _surface_point(0.0, 1.0, p).tolist(),
                "left_sidewall": _surface_point(-1.0, 0.45, p).tolist(),
                "right_sidewall": _surface_point(1.0, 0.45, p).tolist(),
            },
        }
        validation = {
            **checks,
            "passed": all(checks.values()),
            "checks": checks,
            "sampled_surface_separation": separation,
            "warnings": ["Experimental, non-wearable laboratory geometry. Physical fit is unverified."],
            "limitations": GEOMETRY_LIMITATIONS,
            "self_intersections_independently_verified": False,
            "global_minimum_thickness_verified": False,
        }
        mesh_data = {
            "vertices": np.round(mesh.vertices, 7).tolist(),
            "faces": mesh.faces.tolist(),
        }
        (output_dir / "parameters.json").write_text(
            json.dumps({"units": "mm", "parameters": p, "metadata": metadata}, indent=2),
            encoding="utf-8",
        )
        (output_dir / "validation.json").write_text(json.dumps(validation, indent=2), encoding="utf-8")
        return {"parameters": p, "metadata": metadata, "validation": validation, "mesh": mesh_data}
    except Exception as exc:
        for path in generated_paths:
            path.unlink(missing_ok=True)
        if isinstance(exc, ValueError):
            raise
        raise ValueError("CAD generation could not create a valid solid for these parameters.") from exc
