# GitHub Pages edition — validation

The static edition was tested without a Python process or backend API. The test server exposes only built static files under `/3D-Nails/`, matching GitHub Pages project hosting.

- `npm --prefix frontend run build:pages`: strict TypeScript and Vite Pages build passed.
- `node scripts/pages_smoke.cjs`: **40 checks passed**. They cover Greek defaults, language switching and persistence, localized decimal separators/validation errors, preservation of user names and measurements, project-path assets, consent, a native synthetic-device camera capture, upload replacement, actual 16 mm × 10 mm calibrated projected measurements, generated mesh, actual STL/faceted STEP, provenance, review/annotation persistence, reload/Blob URL restoration, isolated browser storage, mobile layout and deletion. No backend requests or unhandled browser errors occurred. Automated WCAG-tagged analysis of the generated-model screen detected no violations. Greek layouts were checked at 390 and 320 pixels wide.
- `node scripts/test_browser_api.cjs`: **41 checks passed** in Chromium, exercising real IndexedDB and canvas, invalid uploads/contours, rotated and rescaled measurements, concurrent writes, review invalidation, references/annotations, actual exports, archived models, reload, dependent-file deletion and empty stores after complete cleanup.
- `node scripts/test_browser_geometry.mjs /tmp/nailform-browser-cad`: **16 checks passed**, including supported tip shapes/flat/minimum/high-curvature dimensions, mesh edge topology, orientation, positive volume, vertex-normal displacement, output changes and invalid input rejection.
- `python scripts/verify_browser_cad.py /tmp/nailform-browser-cad`: **six exported STEP variants independently imported into CadQuery/OpenCascade as one valid solid each**. All contain the 4,096 planar triangular faces corresponding to the displayed mesh. STEP/STL/viewer volumes agree to relative error below 1e-6 and bounds below 1e-5 mm for those fixtures.

The valid browser export is a **faceted BRep**, not the smooth fitted B-spline solid produced by the optional Python engine. Independent development verification of selected files does not imply that every future browser generation has been kernel-validated. Runtime reports correctly leave kernel re-import, independent global self-intersection, global minimum thickness and physical fit unverified.

Current-run UI evidence is written to ignored `artifacts/pages-browser-results.json`, screenshots prefixed `pages-`, and synthetic `pages-reference` downloads. Browser-only test records are deleted at test completion. No real customer photos were used or included in the build.

Localization screenshots include `artifacts/pages-greek-desktop-landing.png` and `artifacts/pages-greek-mobile-geometry.png`. Known camera, storage, contour and CAD messages are translated at display time; original source values and saved records are not rewritten when the language changes.

These software results do not establish capture accuracy on real phones, physical repeatability, printed fit or material/wear suitability. All generated objects remain non-wearable laboratory prototypes.

Public-site publication and HTTPS checks are separate from the successful local static build. A Git commit/push, workflow run or expected URL alone must not be described as a working public deployment until GitHub Pages actually serves it.
