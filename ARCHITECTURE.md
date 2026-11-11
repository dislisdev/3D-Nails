# NAILFORM LAB — Architecture

## ADR 001: local research instrument

The repository was empty at inspection (2026-11-11). Build one responsive React/TypeScript application and one Python FastAPI service. Vite proxies `/api` to the loopback API. SQLite and a private data directory retain sessions and images. CadQuery/OpenCascade performs server-side geometry construction; the browser displays the tessellation of that same solid using Three.js. No cloud database, analytics, or external AI service is needed.

Next.js was suggested, not mandated. Vite keeps this local research workflow small; Python remains the only backend. This application is a development research tool, not a deployed multi-user service.

## Data and responsibility boundaries

- Acquisition: browser camera/upload; image-quality heuristics report capture problems without claiming geometric accuracy.
- Calibration: two image endpoints and an independently known reference length establish a planar scale under an explicit coplanarity assumption.
- Measurement: a human-reviewed 12-point contour yields projected length and sectional widths. Curvature remains unknown.
- CAD: measured or manually adjusted dimensions plus explicitly manual curvature, thickness, and extension inputs produce an experimental parametric shell.
- Review: session states and professional notes preserve the distinction between CAD validity, geometric review, and independently verified fit.
- Persistence: browser-owned local workspace and SQLite. Research images require consent; deletion removes session data and files. No customer data is bundled.

See `backend/app/` for API, measurement, and geometry contracts and `frontend/src/` for acquisition and review interfaces. JSON exports preserve CAD parameters and validation results.

## Existing asset inventory

At initial inspection, the supplied material was the Master Implementation Brief only. The original CAD package was subsequently uploaded as `nail_design_v1(1).zip`. It contains the five N01–N05 STL/STEP pairs, generation/validation/render scripts, parameters, manifest, reports and previews. All ten model hashes match the supplied manifest. Detailed inventory and compatibility findings are recorded separately in `LEGACY_ASSET_INVENTORY.md`. The uploaded archive remains outside the public build and is preserved unchanged.

The geometry service is independent so the original V1 adapter can be compared against the new implementation. Original output reproduction requires its recorded toolchain and independent regression checks before adopting its formulas. The archive's trimmed Bézier outline and variable normal thickness are useful integration candidates; no replacement output is described as an original V1 fixture.

## Constraints

Photo calibration does not reconstruct 3D shape or correct lens distortion/perspective. The current CAD is an adjustable approximation rather than a recovered nail surface. Lab output is non-wearable; the stated resin has not been validated for nail/skin contact. Remote deployment needs separate authentication, transport, retention, and operational design.

## ADR 002: free GitHub Pages browser runtime

The owner selected GitHub Pages for the public site. Pages serves static files, so the public build uses a typed adapter in `frontend/src/browser/` rather than calling the Python API. The adapter preserves the acquisition/measurement/session/review contract using IndexedDB, canvas-based labelled quality heuristics and the same calibrated polygon mathematics. Source photographs and research data remain on the visitor's device.

The browser geometry module samples the same inner-surface formulas and nominal normal displacement into a closed triangular shell. That exact mesh drives the viewer, binary STL and planar-face faceted STEP. This is explicitly distinguished from the Python B-spline fit and its runtime OpenCascade validation. Original Python modules and tests remain available; changing the build mode selects the runtime without duplicating the product interface.

Browser persistence serializes writes, guards record revisions and regenerates transient Blob URLs from saved assets after reload. It provides local research records, not a cloud professional-account system. Deployment uses the official GitHub Pages artifact workflow and requires the repository's Pages source to be enabled.
