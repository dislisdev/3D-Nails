# Research log

## 2026-11-11 — Starting evidence

- **Observed:** empty Git checkout, no application files or prior CAD assets; remote Git read succeeds with no advertised refs.
- **User-provided evidence:** prior synthetic printed shapes were visually evaluated; excess curvature was observed for one reference. No numerical geometry, independent accuracy data, or validated material suitability was supplied.
- **Hypothesis:** calibrated projected 2D contours plus explicit manual curvature can support an honest, inspectable laboratory workflow.
- **Unknown:** nail-surface recovery accuracy, acceptable fit tolerances, per-device lens effects, inter-operator repeatability, printed dimensional stability, wear safety.

## Method decisions

The baseline is human-assisted photographic measurement. A draggable initial contour is a manual template, not an automatic segmentation result. Scale uses two points spanning a known length in the photograph. It assumes the reference and nail are coplanar and does not establish that assumption. Blur/brightness/glare indicators are heuristics only.

Touch & Slide and multi-view reconstruction remain research alternatives; browser pixels cannot supply physical scale. Side/front/oblique photographs can be collected for review but do not automatically yield curvature. ArUco markers could improve planar registration; a marker alone cannot recover the full curved nail surface.

## Next controlled experiment

Use an independently measured non-human nail-like reference. Acquire repeated images across pose and lighting with a coplanar scale; have two operators repeat contour correction. Compare projected length and sectional widths to the reference, and quantify within-operator and between-operator variation. Characterize curvature independently before evaluating 3D model gaps/interference. Keep evaluation objects separate from development fixtures. No universal fit tolerance is assumed.

## Verified software outcomes

36 backend tests and 42 browser checks passed. An independent, clearly synthetic planar fixture returned the specified 16 mm projected length and 10 mm width; curvature remained unknown. Actual CadQuery solids, STL/STEP round trips, viewer mesh, session persistence, annotations, reported reference comparisons and deletion were exercised. A deliberate four-pixel change produced the expected descriptive error/spread summaries. Seven automated accessibility screen checks reported no violations after correcting low contrast and focusable scroll regions. See `VALIDATION_RESULTS.md` for evidence and limits. None of these outcomes establishes physical nail-measurement accuracy or product suitability.

## GitHub Pages and subsequently supplied legacy assets

The owner selected free GitHub Pages hosting. The public edition runs acquisition, consent, calibrated 2D measurement, local persistence, review and actual faceted STL/STEP generation in the browser. Local static checks pass without an API server; see `PAGES_VALIDATION.md`. The original Python/CadQuery workflow is retained separately.

The original archive was then supplied. Its SHA256 is `e97ba908c34fdee377b590a6cc98f4813b4e598944901bb4823b56ff8d673729`; it contains 26 members including all five STL/STEP pairs, source, parameters and reports. All ten model checksums match its manifest. Included geometry is synthetic and has no verified personalized fit. Asset inspection and original-engine compatibility findings are tracked in `LEGACY_ASSET_INVENTORY.md`; receiving the archive does not establish integration into the current browser model.
