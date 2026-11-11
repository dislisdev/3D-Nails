# Research MVP V1 — Implementation record

## Sequence

1. Inspect empty repository and available assets; record missing original CAD package.
2. Establish API, provenance, session, and geometry contracts before parallel implementation.
3. Build premium responsive UI with guided camera/upload and manual calibration/contour editing.
4. Implement tested calibrated 2D measurement, private local persistence, and consent/deletion.
5. Generate actual CAD solids, validate and export STL/STEP, display the exported solid's mesh.
6. Connect professional review and research records; test failure paths and visual layouts.
7. Exercise reusable install/start instructions and save cloud environment draft.

## Acceptance criteria

A user can create a session, upload/capture an image, establish a physical scale, edit and review a contour, distinguish measured from manual/unknown geometry, generate and inspect a 3D shell, export real STL and STEP, and save/delete research feedback. Camera denial, missing scale, invalid contours/geometry, and interrupted operations expose actionable errors. Data and statistics must be real or explicitly marked as synthetic test data.

Readiness requires meaningful geometry/measurement/API tests, frontend type/build checks, desktop/mobile browser workflow checks, and saved environment startup instructions. Physical accuracy, camera behavior on real mobile hardware, and material/fit suitability are separate experiments, not software acceptance claims.
