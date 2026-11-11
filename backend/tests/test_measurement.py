import math

import numpy as np
import pytest

from app.measurement import image_quality, measure_polygon
from app.schemas import MeasurementRequest


POINTS = [(200, 50), (250, 50), (275, 90), (280, 150), (280, 220), (250, 250),
          (200, 250), (150, 250), (120, 220), (120, 150), (125, 90), (150, 50)]


def payload():
    return {"image_id": "fixture", "contour": [{"x": x, "y": y} for x, y in POINTS],
            "calibration": {"a": {"x": 10, "y": 10}, "b": {"x": 110, "y": 10}, "reference_mm": 10},
            "method": "calibrated_photo"}


def test_known_polygon_scale_and_unknown_curvature():
    result = measure_polygon(MeasurementRequest(**payload()), 400, 400)
    assert result["length_mm"] == 20
    assert result["width_mm"] == 16
    assert result["scale_mm_per_px"] == .1
    assert result["sectional_widths_mm"][2]["width_mm"] == 16
    assert result["provenance"]["transverse_rise_mm"] == "unknown"
    assert result["provenance"]["length_mm"] == "measured"
    assert "Unquantified" in result["uncertainty"]


def test_reference_scale_changes_every_length():
    first = measure_polygon(MeasurementRequest(**payload()), 400, 400)
    second_data = payload()
    second_data["calibration"]["reference_mm"] = 20
    second = measure_polygon(MeasurementRequest(**second_data), 400, 400)
    assert second["length_mm"] == first["length_mm"] * 2
    assert second["width_mm"] == first["width_mm"] * 2
    assert all(a["width_mm"] == pytest.approx(b["width_mm"] * 2, abs=1e-5) for a, b in zip(second["sectional_widths_mm"], first["sectional_widths_mm"]))


def test_image_rotation_does_not_change_projected_dimensions():
    data = payload()
    angle = math.radians(25)
    for point in data["contour"] + [data["calibration"]["a"], data["calibration"]["b"]]:
        x, y = point["x"] - 200, point["y"] - 200
        point["x"] = 300 + x * math.cos(angle) - y * math.sin(angle)
        point["y"] = 300 + x * math.sin(angle) + y * math.cos(angle)
    result = measure_polygon(MeasurementRequest(**data), 600, 600)
    assert result["length_mm"] == pytest.approx(20, abs=1e-5)
    assert result["width_mm"] == pytest.approx(16, abs=1e-5)


@pytest.mark.parametrize("problem", ["scale_zero", "duplicate", "crossed", "out_of_bounds", "wrong_landmarks", "line"])
def test_invalid_contours_and_calibration_fail(problem):
    data = payload()
    if problem == "scale_zero":
        data["calibration"]["b"] = data["calibration"]["a"].copy()
    elif problem == "duplicate":
        data["contour"][1] = data["contour"][2].copy()
    elif problem == "crossed":
        data["contour"][2], data["contour"][8] = data["contour"][8], data["contour"][2]
    elif problem == "out_of_bounds":
        data["contour"][4]["x"] = 500
    elif problem == "wrong_landmarks":
        data["contour"] = list(reversed(data["contour"]))
    else:
        data["contour"] = [{"x": 100 + i, "y": 100} for i in range(12)]
    with pytest.raises(ValueError):
        measure_polygon(MeasurementRequest(**data), 400, 400)


def test_blurred_dark_and_glare_heuristics_are_explicit():
    dark = image_quality(np.zeros((100, 100, 3), dtype=np.uint8))
    bright = image_quality(np.full((100, 100, 3), 255, dtype=np.uint8))
    assert dark["blur_score"] == 0
    assert any("lighting" in warning for warning in dark["warnings"])
    assert bright["glare_fraction"] == 1
    assert bright["status"] == "heuristic_only"
    assert bright["framing"] == "manual_review_required"
