# Original V1 CAD asset inspection

Inspected on 2026-11-11 after the initial application implementation. The original
package is now available locally and its representative model is reproducible.
This inspection does **not** integrate it into the application's current engines.

## Provenance and preservation

- Uploaded archive: `nail_design_v1(1).zip`, 29,087,259 bytes.
- SHA-256: `e97ba908c34fdee377b590a6cc98f4813b4e598944901bb4823b56ff8d673729`.
- 26 members, 60,192,119 uncompressed bytes. Paths, duplicate names, symlink bits,
  encryption flags, member/total sizes and compression ratios were checked before
  controlled extraction to a temporary directory. No unsafe members were found.
- All ten included STL/STEP SHA-256 values match `manifest.json`.
- The uploaded ZIP remains unchanged outside the checkout. Its source scripts,
  CAD files and previews were not copied into Git or the public Pages assets.
- `QA/audit_original_v0.json` describes an earlier nine-coupon package. That earlier
  archive is not included; its models were not independently inspected here.

## Inventory

| Directory / file | Contents |
|---|---|
| `SOURCE/` | `generate_nails.py`, `validate_nails.py`, `render_previews.py`, requirements |
| `STL/` | N01 standard, N02 thinner, N03 thicker, N04 flatter, N05 more curved |
| `STEP/` | Corresponding five smooth, trimmed CAD solids |
| `PREVIEW/` | N01 design views, N01 measurement map, before/after PNG |
| `MEASUREMENT/` | Greek print log instructions and JSON recording template |
| `QA/` | Earlier V0 audit and V1 digital validation report |
| Root | Greek README, Greek technical specification, sources, manifest, parameter JSON |

The N01 design-view preview was visually inspected. It depicts the actual rounded
oval shell, concave underside and varying thickness, rather than a photographic
measurement or a verified individual fit.

## Exact experimental parameters

All models use **12 mm inner outline width, 18 mm inner outline length and
0.65 mm longitudinal bow**, before perimeter fillets. These are synthetic design
choices, not population sizing standards or measurements of a customer.

| Model | Transverse rise H | Base wall | Tip wall | Central bump | Centre wall P2 | Rim fillet |
|---|---:|---:|---:|---:|---:|---:|
| N01 standard | 1.80 | 0.40 | 0.50 | 0.35 | 0.80 | 0.08 |
| N02 thinner | 1.80 | 0.30 | 0.40 | 0.25 | 0.60 | 0.06 |
| N03 thicker | 1.80 | 0.50 | 0.60 | 0.45 | 1.00 | 0.10 |
| N04 flatter | 1.20 | 0.40 | 0.50 | 0.35 | 0.80 | 0.08 |
| N05 more curved | 2.40 | 0.40 | 0.50 | 0.35 | 0.80 | 0.08 |

All values are in millimetres. Normal displacement thickness, overall shell
height and curvature rise are separate quantities. P2 is not claimed to be the
global maximum thickness; the generator records a sampled peak separately.

## Existing algorithms and reusable components

The inspected generator uses eight tangent-continuous cubic Bézier segments for
the rounded proximal boundary, lateral walls and oval distal outline. It builds
analytic transverse/longitudinal inner geometry, samples inner and outer surfaces
on a 35 × 47 grid and constructs OCP B-spline surfaces using SciPy
`RectBivariateSpline`. The outer surface follows a variable displacement along
the analytic inner normal. Trimmed faces are sewn into a solid and sixteen
perimeter edges receive fillets. Failed filleting is an error; no unrounded
fallback is silently exported.

Useful integration candidates are the original outline controls, variable
normal-wall field, trimmed-surface construction, landmark definitions, explicit
fillet edge selection, STEP/STL round-trip checks and normal-intersection
thickness validator. Preserve the original generator and JSON unchanged as
regression fixtures before adapting any of these components.

The source's exploratory parameter envelope is width 8–18 mm, length 12–26 mm,
positive inputs, transverse rise less than one third of width and fillet radius
less than one third of the smaller edge-wall parameter. It does not establish
an anatomical or manufacturing envelope.

## Checks actually rerun

An isolated environment at `/workspace/.venvs/nailform-legacy-v1` was installed
using the versions recorded in the original manifest: CadQuery **2.8.0**, NumPy
**2.3.5**, SciPy **1.17.0**, trimesh **4.11.1**; VTK is also available for the
original validator. The application's existing Python environment was unchanged.

All five supplied STEP models independently import as one valid solid. All five
STLs are watertight, consistently wound and one connected positive-volume body.
The original inspected validator was rerun using separate temporary QA output:
five labelled points plus a 17 × 21 interior grid per model, **362 samples each,
1,810 samples total**. It tests normal intersections against final filleted STEP
and STL geometry. Every supplied report value was reproduced.

| Model | STL triangles | CAD volume mm³ | Maximum sampled STEP wall error mm | Maximum sampled STL wall error mm |
|---|---:|---:|---:|---:|
| N01 | 221,262 | 107.459240 | 0.000000925 | 0.003179 |
| N02 | 284,152 | 81.628250 | 0.000000661 | 0.003544 |
| N03 | 186,476 | 133.625538 | 0.000001191 | 0.003435 |
| N04 | 220,948 | 104.495311 | 0.000000795 | 0.003027 |
| N05 | 226,018 | 111.066188 | 0.000001143 | 0.003945 |

Only **N01** was regenerated from the original source during this inspection.
Its regenerated STL is **byte-for-byte identical** to the supplied STL. CAD volume
107.45923990176175 mm³, external dimensions
12.403919467999625 × 18.10743931820846 × 2.5713078962983165 mm and 221,262 STL
triangles match exactly. STEP file hashes differ after export; imported geometry
and dimensions match. Byte-identical STEP reproduction is not claimed.

The original generation command, after safe local extraction, is:

```bash
/workspace/.venvs/nailform-legacy-v1/bin/python \
  /path/to/private/nail_design_v1/SOURCE/generate_nails.py \
  --parameters /path/to/private/nail_design_v1/model_parameters.json \
  --out /tmp/nailform-v1-reproduction --only N01
```

Always give a separate output directory: the generator writes its model files,
manifest and parameter JSON. The validator writes `QA/validation_report.json`
under its configured root; preserve the supplied report and direct fresh QA to
a separate local directory. No archive-supplied code should be run without first
inspecting it.

## Differences from the current application

The current local Python engine uses a separate simplified shell parameterization
and uniform nominal thickness; it does not reproduce the original Bézier trim,
variable wall profile or perimeter fillets. The browser engine samples that
current parameterization into a closed mesh and exports the same facets in STL
and STEP. Its faceted STEP is distinct from the original smooth V1 STEP surfaces.

The original package is preserved as local comparison evidence. It is **not** a
selectable browser preset or an automatically connected CAD backend. Current app
output must not be labelled N01–N05 or described as reproducing those models.
Further integration should add an explicit engine/version contract and retain
the validated original files locally as regression references.

None of these digital checks establish physical measurement accuracy, repeatable
printing accuracy, global minimum thickness at the filleted rim, exhaustive
self-intersection freedom, material suitability, human fit or suitability for
wear. No fastening clearance, printer compensation or validated contact geometry
is supplied by the original package.
