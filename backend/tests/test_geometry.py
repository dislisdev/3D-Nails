"""CAD checks use OpenCascade solids, exported files and the real viewer mesh."""

import json
from pathlib import Path

import cadquery as cq
import numpy as np
import pytest
import trimesh

from app.geometry import generate_geometry, validate_parameters, _surface_point, _normal


BASE = {
    "length_mm": 15.0,
    "width_mm": 12.0,
    "transverse_rise_mm": 1.2,
    "longitudinal_rise_mm": 0.4,
    "thickness_mm": 0.5,
    "extension_mm": 2.0,
    "tip_shape": "oval",
    "asymmetry_mm": 0.0,
}


@pytest.mark.parametrize(
    "variant",
    [
        {},
        {"tip_shape": "almond", "asymmetry_mm": 1.5},
        {"tip_shape": "squoval", "extension_mm": 15, "asymmetry_mm": -1.5},
        {"transverse_rise_mm": 0, "longitudinal_rise_mm": 0},
        {
            "length_mm": 4,
            "width_mm": 3,
            "transverse_rise_mm": 0,
            "longitudinal_rise_mm": 0,
            "thickness_mm": 0.25,
            "extension_mm": 0,
        },
        {
            "length_mm": 4,
            "width_mm": 30,
            "transverse_rise_mm": 6,
            "longitudinal_rise_mm": 4,
            "thickness_mm": 1.5,
            "extension_mm": 0,
        },
    ],
    ids=["oval", "almond-asymmetric", "squoval-extended", "flat", "small-flat", "wide-high"],
)
def test_real_exports_and_viewer_mesh_agree(tmp_path: Path, variant: dict):
    result = generate_geometry(BASE | variant, tmp_path)
    assert result["validation"]["passed"]
    assert all(result["validation"]["checks"].values())

    step = cq.importers.importStep(str(tmp_path / "model.step")).val()
    assert step.isValid()
    assert len(step.Solids()) == 1
    assert step.Volume() > 0

    stl = trimesh.load_mesh(tmp_path / "model.stl", process=True)
    viewer = trimesh.Trimesh(**result["mesh"], process=True)
    assert stl.is_watertight and viewer.is_watertight
    assert stl.is_winding_consistent and viewer.is_winding_consistent
    assert stl.volume == pytest.approx(viewer.volume, rel=1e-5)
    assert stl.bounds == pytest.approx(viewer.bounds, abs=1e-5)
    assert step.Volume() == pytest.approx(stl.volume, rel=0.03)
    assert np.isfinite(viewer.vertices).all()
    assert (viewer.area_faces > 1e-12).all()

    parameters_file = json.loads((tmp_path / "parameters.json").read_text())
    report_file = json.loads((tmp_path / "validation.json").read_text())
    assert parameters_file["units"] == "mm"
    assert parameters_file["parameters"] == result["parameters"]
    assert report_file == result["validation"]
    assert result["metadata"]["fit_validated"] is False
    assert report_file["global_minimum_thickness_verified"] is False
    assert report_file["self_intersections_independently_verified"] is False


def test_design_changes_change_exported_geometry(tmp_path: Path):
    baseline = generate_geometry(BASE, tmp_path / "baseline")
    thicker = generate_geometry(BASE | {"thickness_mm": 0.9}, tmp_path / "thicker")
    flatter = generate_geometry(BASE | {"transverse_rise_mm": 0.2}, tmp_path / "flatter")
    longer = generate_geometry(BASE | {"length_mm": 20}, tmp_path / "longer")
    assert thicker["metadata"]["volume_mm3"] > baseline["metadata"]["volume_mm3"] * 1.5
    assert flatter["metadata"]["dimensions_mm"]["z"] < baseline["metadata"]["dimensions_mm"]["z"]
    assert longer["metadata"]["dimensions_mm"]["y"] > baseline["metadata"]["dimensions_mm"]["y"] + 4
    assert flatter["mesh"] != baseline["mesh"]


def test_surface_separation_is_distinct_from_rise(tmp_path: Path):
    result = generate_geometry(
        BASE | {"transverse_rise_mm": 4, "longitudinal_rise_mm": 2, "thickness_mm": 0.6},
        tmp_path,
    )
    separation = result["metadata"]["sampled_surface_separation"]
    assert separation["sample_count"] == 35
    assert separation["minimum_mm"] == pytest.approx(0.6, abs=0.01)
    assert separation["maximum_mm"] == pytest.approx(0.6, abs=0.01)
    assert result["metadata"]["dimensions_mm"]["z"] > 5
    assert separation["global_minimum_verified"] is False


@pytest.mark.parametrize(
    "invalid",
    [
        {"width_mm": 0},
        {"length_mm": float("nan")},
        {"thickness_mm": -1},
        {"thickness_mm": True},
        {"extension_mm": 100},
        {"transverse_rise_mm": 6, "width_mm": 5},
        {"asymmetry_mm": 2, "width_mm": 3},
        {"tip_shape": "rectangle"},
    ],
)
def test_invalid_geometry_is_rejected_without_exports(tmp_path: Path, invalid: dict):
    with pytest.raises(ValueError):
        generate_geometry(BASE | invalid, tmp_path)
    assert not list(tmp_path.iterdir())


def test_required_parameter_is_not_silently_invented():
    missing = BASE.copy()
    del missing["transverse_rise_mm"]
    with pytest.raises(ValueError, match="transverse_rise_mm is required"):
        validate_parameters(missing)


def test_selected_tip_does_not_change_natural_body_or_normals():
    """A cosmetic free-edge choice must not resize/recurve measured base inputs."""
    for extension in (0, 0.1, 2, 15):
        parameters = BASE | {"extension_mm": extension, "asymmetry_mm": 1.5}
        boundary = parameters["length_mm"] / (parameters["length_mm"] + extension)
        for u in (-1, -0.6, 0, 0.4, 1):
            for fraction in (0, 0.2, 0.45, 0.8, 1):
                v = fraction * boundary
                expected_point = _surface_point(u, v, parameters)
                expected_normal = _normal(u, v, parameters)
                for shape in ("oval", "almond", "squoval"):
                    changed = parameters | {"tip_shape": shape}
                    assert _surface_point(u, v, changed) == pytest.approx(expected_point, abs=1e-12)
                    assert _normal(u, v, changed) == pytest.approx(expected_normal, abs=1e-12)
        if extension:
            distal_y = [_surface_point(.7, 1, parameters | {"tip_shape": shape})[1]
                        for shape in ("oval", "almond", "squoval")]
            assert len(set(distal_y)) == 3


def test_distal_landmark_is_not_the_artificial_extension_tip(tmp_path):
    result = generate_geometry(BASE, tmp_path)
    metadata = result["metadata"]
    assert metadata["tip_shape_applies_to"] == "free_edge_extension"
    assert metadata["natural_length_mm"] == BASE["length_mm"]
    assert metadata["landmarks_mm"]["distal"][1] == pytest.approx(BASE["length_mm"])
    assert metadata["landmarks_mm"]["design_tip"][1] == pytest.approx(BASE["length_mm"] + BASE["extension_mm"])


def test_zero_extension_ignores_selected_tip_at_every_surface_sample():
    parameters = BASE | {"extension_mm": 0}
    for u in np.linspace(-1, 1, 11):
        for v in np.linspace(0, 1, 17):
            baseline = _surface_point(u, v, parameters)
            for shape in ("almond", "squoval"):
                assert _surface_point(u, v, parameters | {"tip_shape": shape}) == pytest.approx(baseline, abs=1e-12)
