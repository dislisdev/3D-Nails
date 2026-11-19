// Πειραματικό · σύνθεση αρχείου συμβολαίου 0.3 · WebApp 0.1.0.
import { CHECKER_VERSION, checkMeasurement, exporterK5, rimSystematics, sameOriginalContour } from '../contract/check_measurement.mjs';
import * as taubin from '../methods/taubin.mjs';
import * as triplet from '../methods/triplet-median.mjs';
import { makeControl, makeOutline, makeReference, makeScale, makeView, PROFILE } from './calibration.mjs';
import { APP_VERSION, FORMAT_VERSION, INPUT_MESSAGES, INTERFACE_VERSION, MATURITY, MeasurementInputError } from './catalog.mjs';
import { distance, selectSupport, supportExtents, wrapDelta } from './geometry.mjs';
import { digestInputs } from './identity.mjs';

export { CHECKER_VERSION };

const methods = [
  {
    module: taubin, definition: 'taubin_algebraic_vertex_v1', kind: 'conservative', ratio: 1.114,
    evidence: 'Taubin 0.3.0 · σχόλιο βαθμονόμησης στην πηγή, 600 συνθετικές λήψεις, σπόρος 418921, 216 px, 120°, σ 0,6 px ανά άξονα · RMS(u)/RMSE 1,114.',
  },
  {
    module: triplet, definition: 'median_triplet_circumradii_v1', kind: 'conservative', ratio: 1.6,
    evidence: 'Triplet median 0.4.0 · σχόλιο βαθμονόμησης στην πηγή, 103 σημεία, 60 έως 3000 px, κανονικός θόρυβος, βέλος/σ 1,9 έως 13 · κάτω άκρο του αναφερόμενου RMS(U)/RMSE 1,60 έως 4,83.',
  },
];
export const METHOD_INFO = methods.map(({ module, kind }) => ({ id: module.METHOD_ID, version: module.METHOD_VERSION, kind }));

const diagnosticUnits = {
  n_points: 'count', n_distinct_points: 'count', n_triplet_support_points: 'count',
  n_attempted_triplets: 'count', n_valid_triplets: 'count', n_fit_points: 'count',
  n_inliers: 'count', center_iterations: 'count',
  max_standardized_residual: '1', sagitta_snr: '1', sagitta_to_noise: '1', curvature_snr: '1', uncertainty_inflation: '1',
};
function unitsOf(diagnostics) {
  const units = {};
  // Οι εκδόσεις του πακέτου δηλώνουν επίπεδα διαγνωστικά.
  for (const [key, value] of Object.entries(diagnostics)) {
    if (typeof value !== 'number') continue;
    const unit = diagnosticUnits[key] ?? (key.endsWith('_px') ? 'px' : key.endsWith('_deg') ? 'deg' : null);
    if (!unit) throw new Error('Άγνωστη μονάδα διαγνωστικού ' + key);
    units['/' + key.replaceAll('~', '~0').replaceAll('/', '~1')] = unit;
  }
  return units;
}

const cadPoint = ([x, y], [ox, oy], s, height) => [s * (x - ox), s * (oy - y), height];

function derivedMethod(measurement, raw, points) {
  const { selection, calibration, frame, exporter_k5: k5, view } = measurement;
  const s = calibration.mm_per_px, center = raw.center_px, radiusPx = raw.radius_mm / s;
  const radii = points.map(point => distance(point, center));
  const rms = Math.sqrt(radii.reduce((sum, d) => sum + (d - radiusPx) ** 2, 0) / points.length);
  const theta = points.map(([x, y]) => Math.atan2(center[1] - y, x - center[0]));
  const count = selection.mode === 'full' ? theta.length : theta.length - 1;
  let sweep = 0;
  for (let i = 0; i < count; i++) sweep += wrapDelta(theta[(i + 1) % theta.length], theta[i]);
  const [ax, ay] = selection.anchor_px, n = selection.outward_normal_cad;
  const dot = n ? (center[0] - ax) * n[0] + (ay - center[1]) * n[1] : 0;

  return {
    arc_circle_radius_mm: raw.radius_mm, circle_radius_px: radiusPx,
    center_mm: cadPoint(center, frame.origin_px, s, view.contour_height_mm), radial_rms_px: rms,
    sweep_about_center_deg: radii.includes(0) ? null : sweep * 180 / Math.PI,
    curvature_sign: Math.abs(dot) <= 1e-7 ? 'undetermined' : dot < 0 ? 'convex' : 'concave',
    radius_standard_uncertainty_mm: null,
    radius_rim_systematic_mm: rimSystematics(measurement, radiusPx).radius,
    radius_total_uncertainty_mm: null,
    radius_minus_k5_mm: k5.radius_mm === null ? null : raw.radius_mm - k5.radius_mm,
  };
}

function measureMethods(measurement, points) {
  const input = { case_id: measurement.measurement_id, points_px: points, mm_per_px: measurement.calibration.mm_per_px };
  return methods.map(method => {
    const raw = method.module.estimateRadius(input);
    const ok = raw.status === 'ok';
    return {
      radius_definition: method.definition, output_origin: 'executed_method', uncertainty_assumptions: 'declared_unverified',
      measurability_flag: ok && measurement.selection.measurability === 'not_measurable' ? 'ok_below_sagitta_limit' : 'none',
      uncertainty_model: { kind: method.kind, width_ratio: method.ratio, evidence: method.evidence },
      scale_radius_correlation_unitless: null, diagnostic_units: unitsOf(raw.diagnostics), raw,
      derived: ok ? derivedMethod(measurement, raw, points) : null,
    };
  });
}

function fail(code, message) {
  throw new MeasurementInputError(code, message);
}

export function prepareScale(input) {
  const { image, source, referenceRegion, referenceDimension, referenceOutline, geometry, purpose } = input;
  const { provenance } = source;
  const view = makeView(geometry, provenance);
  const reference = makeReference({ image, region: referenceRegion, dimension: referenceDimension,
    configuration: referenceOutline, view, provenance });
  const calibration = makeScale(reference, view);
  const control = purpose === 'evaluation' ? makeControl({ control: input.control, image, provenance, reference }) : null;
  return { view, reference, calibration, control };
}

export function verifyText(json, { forEvaluation = false } = {}) {
  const results = checkMeasurement(json, { forEvaluation });
  return { version: CHECKER_VERSION, passed: results.every(result => result.passed), results };
}

async function prepare(input) {
  const { image, source, referenceRegion, targetRegion, targetOutline, purpose } = input;
  if (!targetRegion || targetRegion.id === referenceRegion?.id) {
    fail('target', INPUT_MESSAGES.target);
  }
  const generator = source.provenance === 'συνθετικό' ? source.generator : null;
  if (!['αντικείμενο', 'συνθετικό'].includes(source.provenance)
    || source.provenance === 'συνθετικό' && !(generator?.generator_id?.trim()
      && generator.generator_id.length <= 128 && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(generator.generator_version))) {
    fail('provenance', INPUT_MESSAGES.provenance);
  }
  const { view, reference, calibration, control } = prepareScale(input);
  if (targetOutline.edge === 'outer_silhouette' && !targetOutline.center) {
    fail('target-center', INPUT_MESSAGES.targetCenter);
  }
  const contourOutline = makeOutline(targetOutline, image, view, view.contour_height_mm, targetRegion.center);
  const base = [image.image_id, targetRegion.id];
  const originalId = 'original-' + await digestInputs([...base, targetRegion.points]);
  const referenceId = 'reference-' + await digestInputs([image.image_id, referenceRegion.id, referenceRegion.points]);
  const controlSegment = control ? { reference_id: 'control-' + await digestInputs([image.image_id, control.endpoints_px]), ...control } : null;
  return {
    originalId, calibration: { image_id: image.image_id, reference_id: referenceId, ...calibration,
      control_segment: controlSegment, independent_check: control ? 'provided' : 'absent' },
    groupId: 'group-' + await digestInputs(base), generator, view: { ...view,
      reference_outline: reference.outline, contour_outline: contourOutline },
  };
}

async function build(input, prepared, options) {
  const { image, source, purpose, targetRegion } = input;
  const support = selectSupport(targetRegion.points, options);
  if (!support) fail('arc', 'Το τόξο δεν μπορεί να χρησιμοποιηθεί. Διάλεξε πιο απομακρυσμένα άκρα και άφησε ένα τμήμα έξω από την επιλογή.');
  const { calibration, originalId, groupId, generator, view } = prepared;
  const s = calibration.mm_per_px;
  const extents = supportExtents(support.selected, support.mode === 'full');
  const sagittaLimit = 1;
  const contourId = 'contour-' + await digestInputs([originalId, support.inserted, support.indices, support.points]);
  const measurementId = 'measurement-' + await digestInputs([
    APP_VERSION, contourId, purpose, source, input.referenceDimension, calibration.reference_id,
    input.referenceOutline, input.targetOutline, input.geometry, input.control ?? null, options,
  ]);
  const selection = {
    mode: support.mode, sampling: 'as_stored_no_resampling', target_kind: support.targetKind,
    point_indices_unitless: support.indices, anchor_probe_px: support.anchorProbe, anchor_px: support.anchor,
    outward_normal_cad: support.normal, target_length_mm: s * extents.polyline_length,
    sagitta_limit_px: sagittaLimit, measurability: extents.sagitta < sagittaLimit ? 'not_measurable' : 'at_or_above_limit',
  };
  for (const [key, value] of Object.entries(extents)) {
    selection[key + '_px'] = value;
    selection[key + '_mm'] = s * value;
  }
  const frame = {
    origin_px: support.anchor, x_axis: 'right', y_axis: 'up', z_axis: 'toward_camera', handedness: 'right',
    selected_points_mm: support.selected.map(point => cadPoint(point, support.anchor, s, view.contour_height_mm)),
  };
  const measurement = {
    format_version: FORMAT_VERSION, contract_version: FORMAT_VERSION, interface_version: INTERFACE_VERSION,
    maturity: MATURITY, provenance: source.provenance, subject: 'object', measurement_purpose: purpose,
    measurement_id: measurementId, group_id: groupId,
    software: { exporter_id: 'nailform-webapp', exporter_version: APP_VERSION, method_execution: 'browser_unisolated', generator },
    image, view, calibration,
    contour: { contour_id: contourId, image_id: image.image_id, original_contour_id: originalId,
      curve_kind: 'projected_object_boundary', closed: true, points_px: support.points, inserted_point_indices_unitless: support.inserted },
    selection, frame, validation: PROFILE,
  };
  measurement.exporter_k5 = exporterK5(measurement);
  measurement.methods = measureMethods(measurement, support.selected);
  const json = JSON.stringify(measurement, null, 2) + '\n';
  const verdict = verifyText(json, { forEvaluation: purpose === 'evaluation' && source.provenance === 'αντικείμενο' });
  return { measurement, json, verdict };
}

export async function createMeasurement(input, options) {
  return build(input, await prepare(input), options);
}

export async function createEvaluationPair(input, options) {
  const evaluation = { ...input, purpose: 'evaluation' };
  const prepared = await prepare(evaluation);
  const full = await build(evaluation, prepared, { ...options, mode: 'full' });
  const third = await build(evaluation, prepared, { ...options, mode: 'third' });
  if (!sameOriginalContour(full.measurement, third.measurement)) throw new Error('Ασυνεπές αρχικό περίγραμμα.');
  return [full, third];
}

export const DISAGREEMENT_FRACTION = 0.1;
export function disagreement(methods) {
  const [a, b] = methods.map(method => method.raw);
  if (a.status !== b.status) return 'status';
  if (a.status === 'ok' && Math.abs(a.radius_mm - b.radius_mm) > DISAGREEMENT_FRACTION * Math.max(a.radius_mm, b.radius_mm)) {
    return 'radius';
  }
  return null;
}

export function evaluationDifference(raw, knownDiameter) {
  if (raw.status !== 'ok') return null;
  const knownRadius = knownDiameter / 2;
  const difference = raw.radius_mm - knownRadius;
  return { difference, relative: difference / knownRadius };
}
