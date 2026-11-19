// Πειραματικό · κλίμακα κατά το συμβόλαιο 0.3 · WebApp 0.1.0.
import { fitReference, referenceDiameterPx, rimParallaxPx, rimSystematics } from '../contract/check_measurement.mjs';
import { distance, imageCenter, inImage, midpoint, wrapDelta } from './geometry.mjs';
import { INPUT_MESSAGES, MeasurementInputError } from './catalog.mjs';

export const PROFILE = Object.freeze({
  absolute_tolerance_mm: 1e-7,
  absolute_tolerance_px: 1e-7,
  absolute_tolerance_deg: 1e-7,
  absolute_tolerance_mm_per_px: 1e-10,
  relative_tolerance_unitless: 1e-9,
  scale_min_mm_per_px: 1e-6,
  scale_max_mm_per_px: 10,
  radius_min_mm: 0.001,
  radius_max_mm: 10_000,
});

const MAX_RELATIVE_STD = 0.05;
const edges = ['planar_trace', 'upper_rim', 'outer_silhouette', 'unresolved'];
const between = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const std = (value, provenance) => Number.isFinite(value) && (provenance === 'αντικείμενο' ? value > 0 : value >= 0);
const fail = (code, message) => { throw new MeasurementInputError(code, message); };

export function makeView(geometry = {}, provenance) {
  const D = geometry.cameraDistance ?? null, hA = geometry.referenceHeight ?? null, hB = geometry.contourHeight ?? null;
  const uD = geometry.cameraUncertainty ?? null, uA = geometry.referenceHeightUncertainty ?? null;
  const uB = geometry.contourHeightUncertainty ?? null;
  if (D !== null && !(Number.isFinite(D) && D > 0)
    || [hA, hB].some(h => h !== null && !(Number.isFinite(h) && h >= 0 && (D === null || h < D)))
    || [[D, uD], [hA, uA], [hB, uB]].some(([value, u]) => u !== null && (value === null || !std(u, provenance)))) {
    fail('geometry', 'Τα ύψη ή οι αβεβαιότητες δεν γίνονται δεκτά. Δώσε ύψη μικρότερα από την απόσταση του φακού και αβεβαιότητα μόνο για γνωστή τιμή. Άφησε κενό ό,τι αγνοείς.');
  }
  return {
    projection: 'normal_pinhole_assumed', optical_axis_normal: 'assumed_unverified',
    same_plane: hA === null || hB === null ? 'unknown' : hA === hB ? 'equal_nominal_heights' : 'different_nominal_heights',
    negligible_lens_distortion: 'assumed_unverified',
    camera_distance_mm: D, camera_distance_u_mm: uD,
    reference_height_mm: hA, reference_height_u_mm: uA,
    contour_height_mm: hB, contour_height_u_mm: uB,
  };
}

export function makeOutline(options, image, view, height, fallbackCenter) {
  const { edge, center = fallbackCenter } = options;
  const thickness = edge === 'planar_trace' ? 0 : options.thickness ?? null;
  if (!edges.includes(edge) || !inImage(center, image) || thickness !== null
    && (edge === 'planar_trace' ? thickness !== 0 : !(Number.isFinite(thickness) && thickness > 0))) {
    fail('outline', 'Τα στοιχεία του χείλους δεν γίνονται δεκτά. Σημείωσε κέντρο μέσα στην εικόνα και δώσε θετικό πάχος ή άφησέ το κενό.');
  }
  const outline = { edge, center_px: center, center_offset_px: distance(center, imageCenter(image)), thickness_mm: thickness };
  return { ...outline, parallax_px: rimParallaxPx(outline, view.camera_distance_mm, height) };
}

function coversEllipse(points, center) {
  if (points.some(point => distance(point, center) === 0)) return false;
  const angles = points.map(([x, y]) => Math.atan2(y - center[1], x - center[0]));
  const deltas = angles.map((angle, i) => wrapDelta(angles[(i + 1) % angles.length], angle));
  const maximum = Math.min(Math.PI / 4, 4 * Math.PI / points.length) + 1e-9;
  const sweep = Math.abs(deltas.reduce((sum, delta) => sum + delta, 0)) * 180 / Math.PI;
  return deltas.every(delta => delta * deltas[0] > 0 && Math.abs(delta) <= maximum)
    && Math.abs(sweep - 360) <= 1e-7 + 1e-9 * Math.max(sweep, 360);
}

export function makeReference({ image, region, dimension, configuration, view, provenance }) {
  const { diameter, uncertaintyMm, uncertaintyPx, source } = dimension;
  if (!between(diameter, 10, 50)) {
    fail('diameter', 'Η κλίμακα δεν ορίστηκε. Διάλεξε κέρμα ή δώσε διάμετρο μέσα στο επιτρεπόμενο εύρος.');
  }
  if (!std(uncertaintyMm, provenance)) {
    fail('uncertainty-mm', 'Λείπει η τυπική αβεβαιότητα της γνωστής διαμέτρου. Δώσε τιμή σε mm από τη δήλωση ή το όργανο μέτρησης.');
  }
  if (!std(uncertaintyPx, provenance)) {
    fail('uncertainty-px', 'Λείπει η τυπική αβεβαιότητα της διαμέτρου στην εικόνα. Δώσε τιμή σε px από την ανάλυση ή από χωριστή χάραξη.');
  }
  if (typeof source !== 'string' || !source.trim()) fail('source', 'Γράψε από πού προέρχονται η διάμετρος και οι αβεβαιότητες.');
  let fitted;
  try {
    if (region?.points.length >= 8) fitted = fitReference(region.points);
  } catch {
    // Ο ελεγκτής απορρίπτει γεωμετρικά εκφυλισμένη αναφορά.
  }
  if (!fitted || !coversEllipse(region.points, fitted.ellipse_fit.center_px)) {
    fail('reference', 'Η κλίμακα δεν ορίστηκε. Χρειάζεται ολόκληρο το περίγραμμα της κυκλικής αναφοράς. Διάλεξε άλλο αντικείμενο ή άλλαξε το κατώφλι.');
  }
  const center = fitted.ellipse_fit.center_px;
  if (configuration.edge === 'outer_silhouette' && !configuration.center) {
    fail('reference-center', INPUT_MESSAGES.referenceCenter);
  }
  const outline = makeOutline(configuration.edge === 'upper_rim' ? { ...configuration, center } : configuration,
    image, view, view.reference_height_mm, center);
  const diameterPx = referenceDiameterPx(region.points, fitted.ellipse_fit, outline, image);
  const s0 = diameter / diameterPx;
  if (!between(s0, PROFILE.scale_min_mm_per_px, PROFILE.scale_max_mm_per_px)) {
    fail('reference', 'Η κλίμακα είναι εκτός των ορίων του αρχείου. Έλεγξε τη διάμετρο και την επιλογή της αναφοράς.');
  }
  const u0 = uncertaintyPx / diameterPx > MAX_RELATIVE_STD ? null
    : Math.hypot(uncertaintyMm / diameterPx, diameter * uncertaintyPx / (diameterPx * diameterPx));

  return {
    outline,
    fields: {
      reference_kind: 'known_diameter_circle', reference_source: source,
      reference_input: { value: diameter, standard_uncertainty: uncertaintyMm, unit: 'mm' },
      reference_endpoints_px: null,
      reference_circle: { points_px: region.points, diameter_repeats_px: [], diameter_floor_std_px: uncertaintyPx, ...fitted },
      reference_length_mm: diameter, reference_uncertainty_mm: uncertaintyMm, reference_length_px: diameterPx,
      reference_uncertainty_px: uncertaintyPx, length_correlation_unitless: 0, reference_mm_per_px: s0,
      reference_scale_uncertainty_mm_per_px: u0, uncertainty_assumptions: 'declared_unverified',
    },
  };
}

export function makeScale(reference, geometry) {
  const calibration = { ...reference.fields };
  const view = { ...geometry, reference_outline: reference.outline };
  const s0 = calibration.reference_mm_per_px, u0 = calibration.reference_scale_uncertainty_mm_per_px;
  const D = view.camera_distance_mm, hA = view.reference_height_mm, hB = view.contour_height_mm;
  const uD = view.camera_distance_u_mm, uA = view.reference_height_u_mm, uB = view.contour_height_u_mm;
  const known = D !== null && hA !== null && hB !== null;
  const B = D - hA, F = D - hB, k = known ? F / B : 1;
  calibration.mm_per_px = s0 * k;
  if (!between(calibration.mm_per_px, PROFILE.scale_min_mm_per_px, PROFILE.scale_max_mm_per_px)) {
    fail('geometry', 'Η διόρθωση ύψους δίνει κλίμακα εκτός ορίων. Έλεγξε τα ύψη και την απόσταση του φακού.');
  }
  calibration.reference_rim_systematic_mm_per_px = rimSystematics({ calibration, view }).reference;
  calibration.scale_uncertainty_mm_per_px = null;
  if (calibration.reference_circle.ellipse_fit.tilt_flag) calibration.scale_status = 'tilt_flagged';
  else if (!known) calibration.scale_status = 'unknown_geometry';
  else if ([uD, uA, uB].includes(null)) calibration.scale_status = 'unknown_height_uncertainty';
  else if (calibration.reference_rim_systematic_mm_per_px === null) calibration.scale_status = 'unknown_rim';
  else if (u0 === null || Math.hypot(uD, uA) / B > MAX_RELATIVE_STD || Math.hypot(uD, uB) / F > MAX_RELATIVE_STD) {
    calibration.scale_status = 'nonlinear';
  } else {
    const uk = Math.hypot((hB - hA) * uD / (B * B), k * uA / B, uB / B);
    calibration.scale_status = 'usable';
    calibration.scale_uncertainty_mm_per_px = Math.hypot(k * u0, s0 * uk);
  }
  return calibration;
}

export function makeControl({ control, image, provenance, reference }) {
  const endpoints = control?.endpoints;
  if (!control?.independent || !endpoints?.every(p => inImage(p, image)) || endpoints.length !== 2) {
    fail('control', 'Η αξιολόγηση χρειάζεται δεύτερο γνωστό μήκος. Σημείωσε δύο άκρα και δήλωσε ότι είναι ανεξάρτητο και στο ίδιο επίπεδο με την αναφορά.');
  }
  const circular = control.kind === 'circle';
  if (!['circle', 'segment'].includes(control.kind)
    || !between(control.lengthMm, circular ? 10 : 5, circular ? 50 : 100)
    || !std(control.uncertaintyMm, provenance) || !std(control.uncertaintyPx, provenance)
    || typeof control.source !== 'string' || !control.source.trim()) {
    fail('control', 'Το δεύτερο μήκος δεν γίνεται δεκτό. Έλεγξε το εύρος του, τις δύο αβεβαιότητες και την πηγή τους.');
  }
  const p = distance(...endpoints);
  if (!(p > 0) || control.uncertaintyPx / p > MAX_RELATIVE_STD) {
    fail('control', 'Τα άκρα του δεύτερου μήκους δεν επαρκούν για έλεγχο κλίμακας. Διάλεξε δύο πιο καθαρά και πιο μακρινά σημάδια.');
  }
  const u0 = reference.fields.reference_scale_uncertainty_mm_per_px;
  if (u0 === null) fail('uncertainty-px', 'Η αβεβαιότητα της διαμέτρου αναφοράς είναι πολύ μεγάλη για ανεξάρτητο έλεγχο. Χρησιμοποίησε καθαρότερη λήψη ή μεγαλύτερη αναφορά.');
  const ellipse = reference.fields.reference_circle.ellipse_fit;
  const center = midpoint(...endpoints);
  const nearCenter = center.every((value, i) => Math.abs(value - ellipse.center_px[i])
    <= 1e-7 + 1e-9 * Math.max(Math.abs(value), Math.abs(ellipse.center_px[i])));
  if (nearCenter) {
    const angle = (ellipse.angle_deg ?? 0) * Math.PI / 180;
    const sin = Math.sin(angle), cos = Math.cos(angle);
    const onReference = ([x, y]) => {
      const dx = x - ellipse.center_px[0], dy = y - ellipse.center_px[1];
      const radial = Math.hypot((dx * cos + dy * sin) / ellipse.semi_major_px,
        (-dx * sin + dy * cos) / ellipse.semi_minor_px);
      return Math.abs(radial - 1) <= 1e-9 + 1e-9 * Math.max(radial, 1);
    };
    if (endpoints.every(onReference)) fail('control-independent',
      'Το δεύτερο μήκος επαναλαμβάνει τη διάμετρο της αναφοράς. Χρησιμοποίησε χωριστό χάρακα ή τρίτο κέρμα.');
  }
  const s0 = reference.fields.reference_mm_per_px, s2 = control.lengthMm / p;
  const u2 = Math.hypot(control.uncertaintyMm / p, control.lengthMm * control.uncertaintyPx / (p * p));
  if (Math.abs(s2 - s0) > 2 * Math.hypot(u0, u2) + 1e-10 + 1e-9 * Math.max(Math.abs(s2), Math.abs(s0))) {
    fail('control-mismatch', 'Η κλίμακα διαφωνεί με το δεύτερο γνωστό μήκος. Έλεγξε τα άκρα, τις μονάδες και αν τα δύο μήκη βρίσκονται στο ίδιο επίπεδο.');
  }
  return {
    image_id: image.image_id, reference_source: control.source,
    reference_kind: circular ? 'known_diameter_circle' : provenance === 'συνθετικό' ? 'synthetic_segment' : 'object_segment',
    plane: 'reference_plane', endpoints_px: endpoints,
    center_offset_px: distance(midpoint(...endpoints), imageCenter(image)),
    length_mm: control.lengthMm, length_u_mm: control.uncertaintyMm, length_u_px: control.uncertaintyPx,
  };
}
