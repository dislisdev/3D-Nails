# Measurement and geometry validation

## What the baseline measures

The input is a top-view photograph, twelve human-reviewed contour points, and two endpoints spanning an independently known reference dimension. Points may start as a manual template or an experimental image-derived proposal; both require explicit operator review. All coordinates use the original, EXIF-normalized image pixels. Point 0 is the cuticle midpoint, 6 is the natural distal midpoint, 3 and 9 are lateral landmarks. A separate design tip is never used as the measured distal landmark.

`mm_per_pixel = known_reference_mm / distance_between_reference_endpoints_px`

Projected length is the cuticle-to-distal landmark distance multiplied by that scale. Maximum width and five sectional widths come from intersections of the polygon with lines perpendicular to that axis. The method is rotation-invariant in the image plane. The saved contour and scale accompany the measurement history.

This assumes a planar reference coplanar with the subject and a sufficiently suitable view. It does not establish coplanarity, correct perspective/lens distortion, recover surface arc lengths, or determine transverse/longitudinal curvature. Uncertainty remains qualitative until controlled physical data exists. No confidence percentage is produced.

## Automated evidence

`backend/tests/test_measurement.py` covers known polygon dimensions, scale changes, image-plane rotation, invalid/degenerate/crossed/out-of-bounds contours, reference failures, landmark placement, and heuristic image quality. These are algorithmic tests, not evidence of physical capture accuracy.

`tests/fixtures/planar-reference.png` is explicitly synthetic, with independently specified planar coordinates. `planar-reference.json` records a 100-pixel reference span representing 5 mm, a 320-pixel longitudinal span, and a 200-pixel maximum width. Expected software results are **16 mm projected length and 10 mm maximum width**. It is not a hand photograph, a physical reference, or CAD-derived ground truth. Reproduce with `scripts/create_reference_fixture.py`.

`backend/tests/test_api.py` exercises consent, private browser workspaces, real upload/measurement/generation/download, provenance persistence, annotation/reference records, review prerequisites, and deletion of dependent historical exports. SQLite reload checks distinguish persisted data from component state.

Automatic proposals retain their original image-pixel coordinates and declared tip direction. Measurement records distinguish unaltered human-reviewed proposals from manually corrected proposals and include the original snapshot. The live detector analyses the frozen capture frame again instead of saving coordinates from an earlier video frame. Synthetic optical fixtures and local video tests verify these software contracts; they do not establish biological boundary accuracy or performance on the user's phone.

## CAD checks

`backend/tests/test_geometry.py` exercises actual solids with multiple tip shapes, asymmetry, extension, flat geometry and supported parameter extremes. It compares exported STL and STEP round trips, changed parameter outputs, positive volume, watertightness, consistent winding, mesh-versus-BRep volume, expected dimensions, degenerate triangles, and sampled surface separation.

The outer surface is a B-spline approximation fitted to inner-surface samples displaced along their local normals. Thickness is independent of the transverse and longitudinal rise. Separation checks use 35 interior points. They do **not** prove global minimum thickness or absence of all self-intersections. Reports contain explicit false flags for the independent global checks that are not implemented.

The V2 tip profile applies only beyond the natural distal boundary. Tests compare natural-body surface samples across all three shapes, and compare browser body vertices and zero-extension meshes exactly. Shape changes alter the added design extension without reinterpreting natural projected dimensions. This preserves a parametric body; it does not imply reconstruction of the complete photographed contact surface.

## Physical validation still needed

1. Characterize non-human reference objects with independent metrology.
2. Repeat capture across lighting, pose, operators, and actual phones, retaining rejected trials.
3. Compare corresponding projected quantities, quantify repeatability, then separately evaluate curvature recovery.
4. Characterize print error and model gaps/interference against the independent physical reference.
5. Establish acceptable fit tolerances from evidence; assess material and product suitability separately before any human wear.

Reference observations entered in the application are operator-reported. Dashboard signed errors and sample standard deviations are descriptive summaries, not a validated accuracy claim.
