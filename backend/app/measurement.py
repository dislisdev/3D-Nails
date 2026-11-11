"""Calibrated 2D polygon measurements; no inference of unobserved 3D geometry."""

from math import hypot

import cv2
import numpy as np

from .schemas import MeasurementRequest


def image_quality(rgb: np.ndarray) -> dict:
    """Heuristics only: scores depend on subject, resolution, and exposure."""
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    glare = float(np.mean(np.all(rgb >= 245, axis=2)))
    warnings = []
    if blur < 60:
        warnings.append("Low edge detail: the photo may be blurred or lack texture. Review before measuring.")
    if brightness < 45:
        warnings.append("Low overall lighting. Retake with soft, even illumination if boundaries are unclear.")
    if brightness > 225:
        warnings.append("High overall brightness. Check that the nail boundary is still visible.")
    if glare > 0.12:
        warnings.append("Many near-white pixels: inspect for glare or overexposure; a white background can also trigger this.")
    return {
        "blur_score": round(blur, 3),
        "mean_brightness": round(brightness, 3),
        "glare_fraction": round(glare, 6),
        "warnings": warnings,
        "status": "heuristic_only",
        "framing": "manual_review_required",
        "limitations": "These checks do not establish sharp nail boundaries, correct framing, calibration, or measurement accuracy.",
    }


def _cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_segment(a, b, p):
    return (min(a[0], b[0]) - 1e-8 <= p[0] <= max(a[0], b[0]) + 1e-8
            and min(a[1], b[1]) - 1e-8 <= p[1] <= max(a[1], b[1]) + 1e-8)


def _segments_intersect(a, b, c, d):
    x1, x2, x3, x4 = _cross(a, b, c), _cross(a, b, d), _cross(c, d, a), _cross(c, d, b)
    if ((x1 > 0) != (x2 > 0)) and ((x3 > 0) != (x4 > 0)) and all(abs(x) > 1e-8 for x in (x1, x2, x3, x4)):
        return True
    return ((abs(x1) < 1e-8 and _on_segment(a, b, c))
            or (abs(x2) < 1e-8 and _on_segment(a, b, d))
            or (abs(x3) < 1e-8 and _on_segment(c, d, a))
            or (abs(x4) < 1e-8 and _on_segment(c, d, b)))


def _section_width(local: list[tuple[float, float]], station: float) -> float:
    intersections = []
    for i, a in enumerate(local):
        b = local[(i + 1) % len(local)]
        # Half-open interval counts each polygon vertex once.
        if (a[1] <= station < b[1]) or (b[1] <= station < a[1]):
            frac = (station - a[1]) / (b[1] - a[1])
            intersections.append(a[0] + frac * (b[0] - a[0]))
    return max(intersections) - min(intersections) if len(intersections) >= 2 else 0.0


def measure_polygon(request: MeasurementRequest, width: int, height: int) -> dict:
    contour = [(p.x, p.y) for p in request.contour]
    calibration = request.calibration
    all_points = contour + [(calibration.a.x, calibration.a.y), (calibration.b.x, calibration.b.y)]
    if any(x >= width or y >= height for x, y in all_points):
        raise ValueError("Contour and calibration points must be inside the original image.")
    if len(set(contour)) != len(contour):
        raise ValueError("Contour points must be distinct.")
    area2 = sum(contour[i][0] * contour[(i + 1) % 12][1] - contour[(i + 1) % 12][0] * contour[i][1] for i in range(12))
    if abs(area2) < 8:
        raise ValueError("The contour has no usable area.")
    for i in range(12):
        a, b = contour[i], contour[(i + 1) % 12]
        for j in range(i + 1, 12):
            if j == i + 1 or (i == 0 and j == 11):
                continue
            if _segments_intersect(a, b, contour[j], contour[(j + 1) % 12]):
                raise ValueError("Contour edges cross or touch. Correct the control points before measuring.")
    reference_px = hypot(calibration.b.x - calibration.a.x, calibration.b.y - calibration.a.y)
    if reference_px < 5:
        raise ValueError("Calibration endpoints must be at least five image pixels apart.")
    scale = calibration.reference_mm / reference_px
    proximal, distal = contour[0], contour[6]
    length_px = hypot(distal[0] - proximal[0], distal[1] - proximal[1])
    if length_px < 5:
        raise ValueError("Cuticle and distal landmarks must be at least five image pixels apart.")
    along = ((distal[0] - proximal[0]) / length_px, (distal[1] - proximal[1]) / length_px)
    across = (along[1], -along[0])
    local = [((x - proximal[0]) * across[0] + (y - proximal[1]) * across[1],
              (x - proximal[0]) * along[0] + (y - proximal[1]) * along[1]) for x, y in contour]
    if local[3][0] <= 1 or local[9][0] >= -1:
        raise ValueError("Mark point 3 on the right sidewall and point 9 on the left, relative to the cuticle-to-distal axis.")
    if min(y for _, y in local) < -length_px * .1 or max(y for _, y in local) > length_px * 1.1:
        raise ValueError("The cuticle and distal landmarks do not span this contour. Correct points 0 and 6.")
    stations = sorted({y for _, y in local})
    candidate_stations = [y + 1e-6 for y in stations[:-1]]
    candidate_stations += [(a + b) / 2 for a, b in zip(stations, stations[1:])]
    candidate_stations += [y - 1e-6 for y in stations[1:]]
    width_px = max((_section_width(local, y) for y in candidate_stations), default=0)
    if width_px < 2:
        raise ValueError("The contour is too narrow to measure.")
    sections = [{"t": t, "width_mm": round(_section_width(local, t * length_px) * scale, 5)} for t in (0.1, 0.25, 0.5, 0.75, 0.9)]
    warnings = [
        "Physical scale assumes the reference and contour lie in the same plane. Two reference points cannot verify this or correct perspective.",
        "Length and widths are projected 2D measurements of a manually reviewed polygon, not surface arc lengths or a verified fit.",
        "Curvature remains unknown; front, side, and oblique photos are retained for professional inspection only.",
    ]
    if min(y for _, y in local) < -length_px * .05 or max(y for _, y in local) > length_px * 1.05:
        warnings.append("Some boundary points extend beyond the cuticle/distal axis landmarks. Review the landmark placement.")
    return {
        "length_mm": round(length_px * scale, 5),
        "width_mm": round(width_px * scale, 5),
        "sectional_widths_mm": sections,
        "scale_mm_per_px": scale,
        "method": request.method,
        "provenance": {"length_mm": "measured", "width_mm": "measured", "transverse_rise_mm": "unknown", "longitudinal_rise_mm": "unknown"},
        "uncertainty": "Unquantified: manual landmark placement, reference dimensions, perspective, and coplanarity have not been independently validated.",
        "warnings": warnings,
        "contour": [p.model_dump() for p in request.contour],
        "calibration": calibration.model_dump(),
        "image_id": request.image_id,
        "units": "mm",
        "contour_source": "manual_control_points",
    }
