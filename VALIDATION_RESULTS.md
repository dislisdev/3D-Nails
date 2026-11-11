# Verified results — 2026-11-11

## Live assistance and free-edge update

The complete current backend suite passes **55 tests**. The final Pages build passes the existing **40** browser workflow checks and **27** additional live-camera/editor checks. Automatic proposal persistence, live framing guidance, synthetic contrast detection and distal-only CAD invariants have separate checks recorded in [PAGES_VALIDATION.md](PAGES_VALIDATION.md). All optical/video inputs in these automated checks are synthetic. Real phone camera behavior, anatomical detection accuracy and physical fit remain unverified.

## Initial Python MVP validation

- Python 3.12.14, Node 24.22.1, npm 11.9.0; Linux x86_64.
- `bash scripts/install.sh` completed and was repeated successfully. All 58 Python packages are transitively pinned with SHA256 hashes; npm uses the saved lockfile with 85 installed packages. No TLS, signature or checksum verification was disabled.
- `bash scripts/dev.sh` started the loopback API and frontend, checked API/CAD readiness, then was stopped and restarted successfully. Both child services shut down when the helper exited. Processes need restarting in future machines.
- `npm --prefix frontend run build`: strict TypeScript and production build passed. The lazily loaded Three.js viewer chunk is about 521 kB (134 kB gzip); Vite emits a non-failing size advisory. Initial application JS is about 265 kB (83 kB gzip).
- `python -m pytest backend/tests -q`: **36 passed**, including **17 CAD cases**, measured polygon tests and actual FastAPI upload/measure/CAD/download integration. No tests skipped or marked expected-failure.
- `node scripts/browser_smoke.cjs`: **42 passed** on the final source. Current-run evidence is in `artifacts/browser-results.json`.
- Seven axe-core checks with WCAG 2 A/AA, 2.1 A/AA and 2.2 AA tags found **zero automated violations** after contrast and keyboard-scroll fixes. This is bounded automated evidence, not a full accessibility certification or screen-reader audit.

## Browser workflow actually exercised

Chromium was run at desktop 1440×1000, mobile 390×844, and narrow mobile 320×740. Screenshot inspection covered landing composition, calibration controls, actual 3D model, professional review and research tables. Checked layouts have no horizontal page overflow and no unhandled browser application errors.

The test uses Chromium's explicitly enabled **synthetic camera device**, not real phone hardware. Native `getUserMedia`, live video, facing-mode switch, capture and media-track cleanup were exercised. A separate test forced permission denial and verified an actionable upload fallback and successful upload afterward. An isolated browser workspace could not read the first workspace's private session.

The workflow then uploaded the independent synthetic planar reference, placed calibration endpoints, dragged all twelve contour points, tested keyboard correction and undo, acknowledged review, generated an actual CAD solid, rendered its mesh, downloaded STL/STEP, inspected exported provenance, saved professional review and photo pins, recorded independent reference observations, and verified session persistence through browser reload. Test sessions were deleted at completion; only clearly synthetic screenshots and exported demonstration files remain in ignored `artifacts/`.

## Initial demonstration measurements and output

For `tests/fixtures/planar-reference.png`:

| Quantity | Result | Provenance |
|---|---:|---|
| Physical-scale convention | 0.05 mm/image pixel | Synthetic 100 px reference designated as 5 mm |
| Projected length | 16.000 mm | Calibrated manually reviewed 2D contour |
| Maximum projected width | 10.000 mm | Calibrated manually reviewed 2D contour |
| Surface curvature | Unknown | Not reconstructed from images |
| CAD transverse/longitudinal rise | 1.2 / 0.4 mm | Explicit manual research inputs |
| Nominal normal thickness | 0.5 mm | Explicit manual research input |
| Extension | 2 mm | Explicit manual research input |

This generated a single positive-volume solid of approximately **79.754742 mm³**. Its same-solid mesh is watertight with consistent winding; actual STL and STEP round trips passed. The 35 interior surface-separation samples ranged approximately **0.499972–0.500016 mm**. Global minimum thickness and an independent global self-intersection proof remain unverified.

A second synthetic session deliberately shifted the distal point by four pixels. The journal correctly displayed a +0.200 mm length difference, sample SD 0.141 mm and range 0.200 mm for n=2. These are software checks on synthetic data, not measured customer accuracy or physical repeatability results.

## Artifacts

- `artifacts/desktop-landing.png`, `mobile-landing.png`
- `artifacts/desktop-capture.png`, `mobile-upload-fallback.png`
- `artifacts/desktop-calibration.png`, `mobile-calibration.png`
- `artifacts/desktop-geometry.png`, `mobile-geometry.png`, `small-mobile-geometry.png`
- `artifacts/actual-model.png`, `desktop-review.png`
- `artifacts/desktop-research.png`, `mobile-research.png`
- `artifacts/synthetic-reference.stl`, `synthetic-reference.step`
- `artifacts/browser-results.json`, `repository-discovery.json`

## Unrun or unsupported validation

Real iOS Safari/Android camera behavior, device-specific calibration, physical metrology, print-to-reference fit, and material/wear suitability were not tested. Original N01–N05 regressions could not run in this initial validation because their source package was unavailable then; its later upload/inspection is recorded in `LEGACY_ASSET_INVENTORY.md`. Touch & Slide, ArUco/perspective correction and automatic 3D recovery are not implemented. These do not become validated by successful software tests.

## Cloud configuration and publication

The original empty repository was populated on `main` after the owner requested GitHub Pages publication. GitHub Actions builds, tests and publishes only the static browser edition. The Python workflow remains available for local use. Environment-draft publication and public-site publication are separate actions; a saved cloud draft does not deploy the site. Fresh-task cloud snapshot restoration has not been independently verified here.
