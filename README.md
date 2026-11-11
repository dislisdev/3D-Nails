# NAILFORM LAB

Research MVP for a single nail: guided photographs → calibrated projected 2D contour → explicit manual curvature inputs → inspectable CAD shell → actual STL/STEP export → professional observations.

This is a **local research instrument**. Generated objects are **non-wearable laboratory prototypes**. It does not establish physical fit, surface reconstruction accuracy, material suitability, or approval for nail/skin contact.

## GitHub Pages edition

The repository includes a standalone browser edition for free GitHub Pages hosting. See [PAGES_DEPLOYMENT.md](PAGES_DEPLOYMENT.md) for deployment and [PAGES_VALIDATION.md](PAGES_VALIDATION.md) for checks actually performed.

```bash
npm ci --prefix frontend
npm --prefix frontend run build:pages
node scripts/pages_smoke.cjs
```

The Pages edition uses IndexedDB on the visitor's device; photographs and research records are not uploaded to GitHub. Deleting browser storage removes those records. There is no cloud sync, account recovery or automatic backup. The same consent, contour, calibration, review and deletion workflow is available without a Python server.

Browser geometry uses an explicitly labelled faceted approximation of the same parametric surface. The displayed closed triangular mesh, binary STL, and faceted STEP share the same coordinates. Six representative STEP variants have been independently imported into OpenCascade during development; the browser itself does not run OpenCascade or prove global fit/thickness/self-intersection properties. The Python workflow below retains its smooth B-spline CadQuery engine and server-side checks.

## Run

Verified cloud toolchain: Linux x86_64, Python 3.12.14, Node.js 24.22.1, npm 11.9.0, `uv`, and system Chromium. Python 3.12 and Node.js 22+ are required. No database server, external API, or secret is needed.

```bash
cd /workspace/3D-Nails
bash scripts/install.sh
bash scripts/dev.sh
```

The helper starts the API on loopback port **8000** and Vite on loopback port **5173**, checks API/CAD readiness, and stops its child processes on exit. Open the local Vite address printed by the terminal. Frontend code reloads automatically; restart the helper after changing Python modules.

The cloud Python environment is `/workspace/.venvs/nailform`. Outside a `/workspace` machine the scripts use the checkout's `.venv`; override with `NAILFORM_VENV` if needed. Dependencies are locked: Python uses `backend/requirements.lock` with SHA256 verification, and npm uses `frontend/package-lock.json` with `npm ci`. Keep inherited TLS/proxy trust enabled.

Data lives in the ignored `.data/` directory. Set `NAILFORM_DATA_DIR` before startup for a different private location. A random HttpOnly cookie identifies this browser's workspace. Other browser profiles do not share session access. Losing the cookie loses access; this prototype does not provide production accounts or account recovery. Keep development servers on loopback.

Camera access requires a secure browser context. Loopback works on the development computer; testing from a real phone requires a separately configured trusted HTTPS route. Camera denial and unsupported hardware have an upload fallback. Upload accepts JPEG/PNG/WebP; export HEIC to JPEG first. Limits: 12 MB and 20 MP.

## Use

1. Start a session and consent to local research storage. Photograph or upload a top view with a known-size coplanar reference; collect other views for human review.
2. Place scale endpoints A/B and enter the independently known reference length. Move all twelve manual contour points to the visible boundary. C marks the cuticle, D the distal edge; review both scale and contour.
3. Save the measurement. Length and sectional widths are calibrated **2D projections**. Surface curvature stays unknown.
4. Review the projected dimensions and explicitly manual curvature, nominal normal thickness, extension, asymmetry and tip shape. Generate the laboratory model after acknowledging its limitations.
5. Orbit/zoom/pan the actual exported geometry. Inspect multiple views and download STL, STEP, parameter JSON and validation JSON. Changing inputs requires a new generation; old files remain associated with their saved version.
6. Record professional notes, photo pins, research state and independent reference observations. Repeated sessions can share a reference-group label for descriptive spread comparisons in the Research journal.
7. Delete photographs or sessions when no longer needed. Deleting a source photograph also removes dependent measurements and historical CAD exports.

Only use non-human references for physical prototype evaluation. Geometric review does not authorize wear, adhesion testing, or skin contact.

## Validate

With dependencies installed:

```bash
/workspace/.venvs/nailform/bin/python -m pytest backend/tests -q
npm --prefix frontend run build
```

With the development helper running in a separate terminal:

```bash
node scripts/browser_smoke.cjs
```

The browser script uses system Chromium when available (`CHROMIUM_PATH` can select another installation), otherwise Playwright's installed Chromium. Screenshots and current-run results go into ignored `artifacts/`. Install a Playwright browser separately on machines without one. Test data is clearly synthetic; it must not be presented as customer measurements or physical accuracy validation.

See [VALIDATION_RESULTS.md](VALIDATION_RESULTS.md) for actual run outcomes, [MEASUREMENT_VALIDATION.md](MEASUREMENT_VALIDATION.md) for measurement definitions and evidence, and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) for limits.

## Project record

- [ARCHITECTURE.md](ARCHITECTURE.md): decisions, module boundaries and missing V1 asset inventory.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): implementation sequence and acceptance criteria.
- [RESEARCH_LOG.md](RESEARCH_LOG.md): observed evidence, hypotheses and next controlled experiment.

The original CAD package was supplied after the initial MVP implementation. It is retained separately from public site assets; see [LEGACY_ASSET_INVENTORY.md](LEGACY_ASSET_INVENTORY.md) for its verified contents, parameters and compatibility findings. N01–N05 are synthetic research variants, not anatomical sizing standards. The current browser engine is an explicit faceted approximation and does not claim to reproduce those original models.
