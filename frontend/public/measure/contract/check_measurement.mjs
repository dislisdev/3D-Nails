// Πειραματικό · προδιαγραφή Υ3β / Y3b-contract-003 · έκδοση 0.3.0.
export const CHECKER_VERSION = '0.3.0';

const PROFILE = Object.freeze({
  absolute_tolerance_mm: 1e-7, absolute_tolerance_px: 1e-7, absolute_tolerance_deg: 1e-7,
  absolute_tolerance_mm_per_px: 1e-10, relative_tolerance_unitless: 1e-9,
  scale_min_mm_per_px: 1e-6, scale_max_mm_per_px: 10, radius_min_mm: 0.001, radius_max_mm: 10000,
});
const ABS = { mm: 1e-7, px: 1e-7, deg: 1e-7, 'mm/px': 1e-10, '1': 1e-9 };
const own = (o, k) => Object.hasOwn(o, k);
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const number = x => typeof x === 'number' && Number.isFinite(x);
const near = (a, b, unit) => number(a) && number(b)
  && Math.abs(a - b) <= ABS[unit] + 1e-9 * Math.max(Math.abs(a), Math.abs(b));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const U = (a, b, c) => Math.sqrt((a - b) ** 2 + 2 * (1 + c) * a * b);
function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

// Ε1: JSON.parse ελέγχει τη γραμματική· δεύτερο πέρασμα εντοπίζει τα διπλά κλειδιά.
function parseStrict(text) {
  requireThat(typeof text === 'string', 'Η είσοδος πρέπει να είναι κείμενο JSON.');
  const value = JSON.parse(text);
  let pos = 0;
  const whitespace = () => { while (/[\u0020\t\r\n]/.test(text[pos] ?? '\u0000')) pos++; };
  const stringToken = () => {
    const start = pos++;
    while (pos < text.length) {
      if (text[pos] === '\\') pos += 2;
      else if (text[pos++] === '"') return text.slice(start, pos);
    }
    throw new Error('Μη ολοκληρωμένη συμβολοσειρά.');
  };
  const scan = depth => {
    requireThat(depth <= 64, 'Το βάθος JSON υπερβαίνει το 64.');
    whitespace();
    if (text[pos] === '{') {
      pos++; whitespace();
      const keys = new Set();
      if (text[pos] === '}') { pos++; return; }
      while (true) {
        whitespace();
        const key = JSON.parse(stringToken());
        requireThat(!keys.has(key), 'Διπλό όνομα πεδίου στο ίδιο αντικείμενο.');
        keys.add(key); whitespace(); pos++; // άνω και κάτω τελεία
        scan(depth + 1); whitespace();
        if (text[pos++] === '}') return;
      }
    }
    if (text[pos] === '[') {
      pos++; whitespace();
      if (text[pos] === ']') { pos++; return; }
      while (true) {
        scan(depth + 1); whitespace();
        if (text[pos++] === ']') return;
      }
    }
    if (text[pos] === '"') { stringToken(); return; }
    while (pos < text.length && !/[\u0020\t\r\n,}\]]/.test(text[pos])) pos++;
  };
  scan(0);
  const finite = x => {
    if (typeof x === 'number') requireThat(Number.isFinite(x), 'Μη πεπερασμένος αριθμός.');
    else if (x && typeof x === 'object') for (const v of Object.values(x)) finite(v);
  };
  finite(value);
  return value;
}

// Ε2: κλειστά αντικείμενα, εκτός από τα δύο ρητά λεξικά διαγνωστικών.
const obj = fields => ({ kind: 'object', fields });
const array = (item, length) => ({ kind: 'array', item, length });
const nullable = item => ({ kind: 'nullable', item });
const optional = item => ({ kind: 'optional', item });
const dict = item => ({ kind: 'dictionary', item });
const P2 = array('number', 2);
const N = 'number', S = 'string', ID = 'id', optN = nullable(N);
const C = { kind: 'tuple', items: [N, N, optN] };
const RAW = obj({
  method_id: S, method_version: S, status: S, radius_mm: optN, radius_uncertainty_mm: optN,
  center_px: nullable(P2), reason: nullable(S), diagnostics: dict('json'), maturity: S, provenance: S,
});
const DERIVED = obj({
  arc_circle_radius_mm: N, circle_radius_px: N, center_mm: C, radial_rms_px: N,
  sweep_about_center_deg: optN, curvature_sign: S, radius_standard_uncertainty_mm: optN,
  radius_rim_systematic_mm: optN, radius_total_uncertainty_mm: optN, radius_minus_k5_mm: optN,
});
const CIRCLE = obj({
  points_px: array(P2), diameter_repeats_px: array(N), diameter_floor_std_px: N,
  circle_fit: obj({ center_px: P2, radius_px: N, rms_px: N }),
  ellipse_fit: obj({ center_px: P2, semi_major_px: N, semi_minor_px: N, angle_deg: optN,
    eccentricity: N, tilt_flag: 'boolean' }),
});
const CONTROL = obj({
  reference_id: ID, image_id: ID, reference_source: 'text', reference_kind: S, plane: S,
  endpoints_px: array(P2, 2), center_offset_px: N, length_mm: N, length_u_mm: N, length_u_px: N,
});
const EXTENTS = ['endpoint_chord', 'polyline_length', 'support_diameter', 'sagitta', 'spacing_min', 'spacing_mean', 'spacing_max'];
const OUTLINE = obj({ edge: S, center_px: P2, center_offset_px: N, thickness_mm: optN, parallax_px: optN });
const SCHEMA = obj({
  format_version: S, contract_version: S, interface_version: S, maturity: S, provenance: S,
  measurement_id: ID, group_id: ID, subject: S, measurement_purpose: S,
  software: obj({ exporter_id: ID, exporter_version: S, method_execution: S,
    generator: nullable(obj({ generator_id: ID, generator_version: S })) }),
  image: obj({ image_id: ID, width_px: 'integer', height_px: 'integer' }),
  view: obj({ projection: S, optical_axis_normal: S, same_plane: S, negligible_lens_distortion: S,
    camera_distance_mm: optN, camera_distance_u_mm: optN, reference_height_mm: optN,
    reference_height_u_mm: optN, contour_height_mm: optN, contour_height_u_mm: optN,
    reference_outline: OUTLINE, contour_outline: OUTLINE }),
  calibration: obj({ image_id: ID, reference_id: ID, reference_kind: S, reference_source: 'text',
    reference_input: obj({ value: N, standard_uncertainty: N, unit: S }), reference_endpoints_px: nullable(array(P2, 2)),
    reference_circle: nullable(CIRCLE), control_segment: optional(nullable(CONTROL)), independent_check: S,
    reference_length_mm: N, reference_uncertainty_mm: N, reference_length_px: N, reference_uncertainty_px: N,
    length_correlation_unitless: N, reference_mm_per_px: N, reference_scale_uncertainty_mm_per_px: optN,
    mm_per_px: N, scale_uncertainty_mm_per_px: optN, reference_rim_systematic_mm_per_px: optN,
    scale_status: S, uncertainty_assumptions: S }),
  contour: obj({ contour_id: ID, image_id: ID, original_contour_id: ID, inserted_point_indices_unitless: array('integer'),
    curve_kind: S, closed: 'boolean', points_px: array(P2) }),
  selection: obj({ mode: S, sampling: S, target_kind: S, target_length_mm: N, anchor_probe_px: P2, anchor_px: P2,
    outward_normal_cad: nullable(P2), point_indices_unitless: array('integer'), sagitta_limit_px: N, measurability: S,
    ...Object.fromEntries(EXTENTS.flatMap(key => [[key + '_px', N], [key + '_mm', N]])) }),
  frame: obj({ origin_px: P2, x_axis: S, y_axis: S, z_axis: S, handedness: S, selected_points_mm: array(C) }),
  exporter_k5: obj({ definition: S, status: S, center_px: nullable(P2), radius_px: optN, radius_mm: optN }),
  validation: obj(Object.fromEntries(Object.keys(PROFILE).map(k => [k, N]))),
  methods: array(obj({ radius_definition: S, output_origin: S, uncertainty_assumptions: S, measurability_flag: S,
    uncertainty_model: obj({ kind: S, width_ratio: N, evidence: 'text' }),
    scale_radius_correlation_unitless: optN, diagnostic_units: dict(S), raw: RAW, derived: nullable(DERIVED) }), 2),
});

function structure(value, spec, path = '$') {
  let ok = false;
  if (typeof spec === 'string') {
    if (spec === 'json') return; // Ε1 έχει ήδη ελέγξει κάθε τιμή JSON.
    if (spec === 'number') ok = number(value);
    else if (spec === 'integer') ok = number(value) && Number.isInteger(value);
    else if (spec === 'id') ok = typeof value === 'string' && value.length >= 1
      && value.length <= 128 && value.trim().length > 0;
    else if (spec === 'text') ok = typeof value === 'string' && value.trim().length > 0;
    else ok = typeof value === spec;
    requireThat(ok, `Μη έγκυρος τύπος στο ${path}.`);
    return;
  }
  if (spec.kind === 'optional') return structure(value, spec.item, path);
  if (spec.kind === 'nullable') {
    if (value !== null) structure(value, spec.item, path);
    return;
  }
  if (spec.kind === 'tuple') {
    requireThat(Array.isArray(value) && value.length === spec.items.length, 'Μη έγκυρο σημείο CAD στο ' + path + '.');
    spec.items.forEach((field, i) => structure(value[i], field, path + '[' + i + ']'));
    return;
  }
  if (spec.kind === 'array') {
    requireThat(Array.isArray(value) && (spec.length === undefined || value.length === spec.length),
      `Μη έγκυρος πίνακας στο ${path}.`);
    value.forEach((v, i) => structure(v, spec.item, `${path}[${i}]`));
    return;
  }
  requireThat(record(value), `Αναμένεται αντικείμενο στο ${path}.`);
  if (spec.kind === 'dictionary') {
    for (const [k, v] of Object.entries(value)) structure(v, spec.item, `${path}.${k}`);
    return;
  }
  const keys = Object.keys(spec.fields);
  requireThat(Object.keys(value).every(k => own(spec.fields, k)) && keys.every(k => own(value, k) || spec.fields[k].kind === 'optional'),
    `Λείπει ή περισσεύει πεδίο στο ${path}.`);
  for (const k of keys) if (own(value, k)) structure(value[k], spec.fields[k], `${path}.${k}`);
}

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const INTERFACES = ['0.3', '0.4'];
const interfaceMessage = version => `Άγνωστη έκδοση διεπαφής «${version}». Υποστηρίζονται οι 0.3 και 0.4.`;
const METHODS = ['taubin-v0', 'triplet-median-v0'];
const DEFINITIONS = new Map([['taubin-v0', 'taubin_algebraic_vertex_v1'], ['triplet-median-v0', 'median_triplet_circumradii_v1']]);
const K5_DEFINITION = 'geometric_circle_arc_length_trapezoid_v1';
const LENGTH_RANGES = new Map([['known_diameter_circle', [10, 50]], ['object_segment', [5, 100]], ['synthetic_segment', [5, 100]]]);
function checkKnownLength(kind, length, label) {
  const range = LENGTH_RANGES.get(kind);
  requireThat(range && within(length, ...range),
    `Μήκος ${label} ${length} mm εκτός εύρους για ${kind} (${range?.join('–') ?? 'άγνωστο είδος'} mm). Έλεγξε τη μονάδα.`);
}
const within = (v, lo, hi) => number(v) && lo <= v && v <= hi;
const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => sum(values) / values.length;
const nearPoint = (a, b, unit) => near(a[0], b[0], unit) && near(a[1], b[1], unit);
const sameCAD = (a, b) => nearPoint(a, b, 'mm') && a[2] === b[2];
const pointsOf = m => m.selection.point_indices_unitless.map(i => m.contour.points_px[i]);
const cad = (p, m) => [m.calibration.mm_per_px * (p[0] - m.frame.origin_px[0]),
  m.calibration.mm_per_px * (m.frame.origin_px[1] - p[1]), m.view.contour_height_mm];
const comparePoint = (a, b) => a[0] - b[0] || a[1] - b[1];
const validStd = (u, m) => number(u) && (m.provenance === 'αντικείμενο' ? u > 0 : u >= 0);

function wrappedDelta(to, from) {
  const d = to - from;
  if (d <= -Math.PI) return d + 2 * Math.PI;
  return d > Math.PI ? d - 2 * Math.PI : d;
}

function edgeLengths(points, closed) {
  const lengths = points.slice(1).map((p, i) => dist(points[i], p));
  if (closed) lengths.push(dist(points.at(-1), points[0]));
  return lengths;
}

function originalIndices(contour) {
  const inserted = new Set(contour.inserted_point_indices_unitless);
  return contour.points_px.map((_, i) => i).filter(i => !inserted.has(i));
}

function checkInsertions(contour) {
  const P = contour.points_px, n = P.length, added = contour.inserted_point_indices_unitless;
  requireThat(added.every((v, i) => within(v, 0, n - 1) && (i === 0 || v > added[i - 1])),
    'Οι δείκτες παρεμβολής πρέπει να είναι έγκυροι, διαφορετικοί και σε αύξουσα σειρά.');
  if (!added.length) return;
  const original = originalIndices(contour);
  requireThat(original.length >= (contour.closed ? 3 : 2) && (contour.closed || (original[0] === 0 && original.at(-1) === n - 1)),
    'Λείπουν αρχικές κορυφές ή έχει δηλωθεί παρεμβολή πέρα από τα αρχικά άκρα.');
  const edges = contour.closed ? original.length : original.length - 1;
  for (let j = 0; j < edges; j++) {
    const first = original[j], last = original[(j + 1) % original.length], a = P[first], b = P[last];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let previous = 0;
    for (let i = (first + 1) % n; i !== last; i = (i + 1) % n) {
      const t = ((P[i][0] - a[0]) * dx + (P[i][1] - a[1]) * dy) / (dx * dx + dy * dy);
      requireThat(t > previous && t < 1 && nearPoint(P[i], [a[0] + t * dx, a[1] + t * dy], 'px'),
        'Δηλωμένο σημείο παρεμβολής έξω από την αρχική ακμή ή με λανθασμένη σειρά.');
      previous = t;
    }
  }
}

// Δύο ήδη ελεγμένα αρχεία. Η σύγκριση αφορά μόνο την προέλευση της χάραξης.
export function sameOriginalContour(a, b) {
  const p = a.contour, q = b.contour;
  if (a.group_id !== b.group_id || p.image_id !== q.image_id || p.original_contour_id !== q.original_contour_id
    || p.closed !== q.closed) return false;
  const I = originalIndices(p), J = originalIndices(q);
  return I.length === J.length && I.every((index, i) => comparePoint(p.points_px[index], q.points_px[J[i]]) === 0);
}

// Η ταξινόμηση των άκρων διατηρεί τον ίδιο υπολογισμό και με ανάποδη φορά.
function projectedAnchor(points, closed, probe) {
  let best, bestSquared = Infinity;
  const edges = closed ? points.length : points.length - 1;
  for (let i = 0; i < edges; i++) {
    let a = points[i], b = points[(i + 1) % points.length];
    if (comparePoint(a, b) > 0) [a, b] = [b, a];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const fraction = ((probe[0] - a[0]) * dx + (probe[1] - a[1]) * dy) / (dx * dx + dy * dy);
    const t = Math.min(1, Math.max(0, fraction));
    const p = [a[0] + t * dx, a[1] + t * dy];
    const squared = (probe[0] - p[0]) ** 2 + (probe[1] - p[1]) ** 2;
    requireThat(number(squared), 'Απροσδιόριστη προβολή σε ακμή.');
    if (squared < bestSquared || (squared === bestSquared && comparePoint(p, best) < 0)) {
      best = p; bestSquared = squared;
    }
  }
  return best;
}

function halfLengthPoint(points, lengths, length) {
  let remaining = length / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = remaining / lengths[i];
      return points[i].map((v, j) => v + t * (points[i + 1][j] - v));
    }
    remaining -= lengths[i];
  }
  throw new Error('Απροσδιόριστο μέσο κατά μήκος.');
}

function farthestPair(points) {
  let diameter = -1, first, last;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      let a = points[i], b = points[j];
      const d = dist(a, b);
      if (d < diameter) continue;
      if (comparePoint(a, b) > 0) [a, b] = [b, a];
      if (d > diameter || (comparePoint(a, first) || comparePoint(b, last)) < 0) {
        diameter = d; first = a; last = b;
      }
    }
  }
  return { diameter, first, last };
}

function checkSupport(m) {
  const sel = m.selection, contour = m.contour, I = sel.point_indices_unitless;
  const n = contour.points_px.length, full = sel.mode === 'full';
  requireThat(I.length >= 5 && I.every(i => within(i, 0, n - 1)) && new Set(I).size === I.length,
    'Μη έγκυροι ή επαναλαμβανόμενοι δείκτες επιλογής.');
  if (full) {
    requireThat(contour.closed && I.length === n && I.every((v, i) => v === i) && sel.target_kind === 'whole',
      'Το πλήρες χρειάζεται όλη την κλειστή διαδρομή.');
  } else {
    requireThat(sel.mode === 'arc' && ['third_perimeter', 'window_mm'].includes(sel.target_kind)
      && (!contour.closed || I.length < n), 'Άγνωστη ή ασύμβατη επιλογή τόξου.');
    requireThat(I.every((v, i) => i === 0 || v === (contour.closed ? (I[i - 1] + 1) % n : I[i - 1] + 1)),
      'Οι δείκτες τόξου δεν είναι συνεχόμενοι.');
  }
  const anchor = projectedAnchor(contour.points_px, contour.closed, sel.anchor_probe_px);
  requireThat(nearPoint(sel.anchor_px, anchor, 'px') && (sel.outward_normal_cad === null
    || near(Math.hypot(...sel.outward_normal_cad), 1, '1')), 'Ασυνεπής άγκυρα ή εξωτερική κάθετος.');
  const P = pointsOf(m), lengths = edgeLengths(P, full), length = sum(lengths), s = m.calibration.mm_per_px;
  const span = farthestPair(P), u = full ? span.first : P[0], v = full ? span.last : P.at(-1);
  const base = dist(u, v);
  const height = Math.max(...P.map(p => Math.abs((v[0] - u[0]) * (p[1] - u[1]) - (v[1] - u[1]) * (p[0] - u[0])) / base));
  const extents = { endpoint_chord: full ? 0 : base, polyline_length: length, support_diameter: span.diameter,
    sagitta: height, spacing_min: Math.min(...lengths), spacing_mean: length / lengths.length, spacing_max: Math.max(...lengths) };
  for (const [key, value] of Object.entries(extents)) {
    requireThat(sel[key + '_px'] >= 0 && sel[key + '_mm'] >= 0 && near(sel[key + '_px'], value, 'px')
      && near(sel[key + '_mm'], s * value, 'mm'), 'Ασυνεπές γεωμετρικό μέγεθος ' + key + '.');
  }
  requireThat(sel.target_length_mm > 0 && near(sel.target_length_mm, s * length, 'mm'), 'Ασυνεπής φυσική έκταση.');
  if (sel.target_kind === 'third_perimeter') {
    requireThat(contour.closed && near(sel.target_length_mm, s * sum(edgeLengths(contour.points_px, true)) / 3, 'mm'),
      'Το τόξο δεν καλύπτει το ένα τρίτο της περιμέτρου.');
  }
  if (!full) requireThat(nearPoint(halfLengthPoint(P, lengths, length), anchor, 'px'), 'Το τόξο δεν έχει κέντρο την άγκυρα κατά μήκος.');
  requireThat(sel.sagitta_limit_px > 0 && sel.measurability === (height < sel.sagitta_limit_px ? 'not_measurable' : 'at_or_above_limit'),
    'Λάθος όριο βέλους ή κατηγορία μετρησιμότητας.');
}

// Μικρά κανονικά συστήματα 3×3 και 5×5 σε κανονικοποιημένες συντεταγμένες.
function leastSquares(rows, rhs) {
  const n = rows.length, k = rows[0].length;
  const matrix = Array.from({ length: k }, () => Array(k + 1).fill(0));
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    for (let j = 0; j < k; j++) {
      for (let h = 0; h < k; h++) matrix[j][h] += row[j] * row[h];
      matrix[j][k] += row[j] * rhs[i];
    }
  }
  for (const row of matrix) for (let j = 0; j <= k; j++) row[j] /= n;
  for (let j = 0; j < k; j++) {
    let pivot = j;
    for (let i = j + 1; i < k; i++) if (Math.abs(matrix[i][j]) > Math.abs(matrix[pivot][j])) pivot = i;
    requireThat(Math.abs(matrix[pivot][j]) > 1e-12, 'Εκφυλισμένη προσαρμογή αναφοράς.');
    [matrix[pivot], matrix[j]] = [matrix[j], matrix[pivot]];
    for (let i = j + 1; i < k; i++) {
      const ratio = matrix[i][j] / matrix[j][j];
      for (let h = j + 1; h <= k; h++) matrix[i][h] -= ratio * matrix[j][h];
    }
  }
  const beta = Array(k);
  for (let j = k - 1; j >= 0; j--) {
    let v = matrix[j][k];
    for (let h = j + 1; h < k; h++) v -= matrix[j][h] * beta[h];
    beta[j] = v / matrix[j][j];
  }
  return beta;
}

export function fitReference(P) {
  const ox = mean(P.map(p => p[0])), oy = mean(P.map(p => p[1]));
  const g = Math.max(...P.map(([x, y]) => Math.max(Math.abs(x - ox), Math.abs(y - oy))));
  requireThat(g > 0, 'Μηδενική έκταση κυκλικής αναφοράς.');
  const xy = P.map(([x, y]) => [(x - ox) / g, (y - oy) / g]);
  const [u, v, w] = leastSquares(xy.map(([x, y]) => [2 * x, 2 * y, 1]), xy.map(([x, y]) => x * x + y * y));
  const center = [ox + g * u, oy + g * v], radius = g * Math.sqrt(w + u * u + v * v);
  const rms = Math.sqrt(mean(P.map(p => (dist(p, center) - radius) ** 2)));
  requireThat(radius > 0 && number(rms), 'Απροσδιόριστος κύκλος αναφοράς.');

  const [A, B, C, D, E] = leastSquares(xy.map(([x, y]) => [x * x, x * y, y * y, x, y]), P.map(() => 1));
  const det = A * C - B * B / 4, trace = A + C;
  requireThat(det > 0 && trace > 0, 'Η προσαρμοσμένη κωνική δεν είναι έλλειψη.');
  const zx = (B * E / 2 - C * D) / (2 * det), zy = (B * D / 2 - A * E) / (2 * det);
  const k = 1 + A * zx * zx + B * zx * zy + C * zy * zy;
  let spread = Math.hypot(A - C, B);
  if (spread <= 1e-12 * trace) spread = 0;
  const small = (trace - spread) / 2, large = (trace + spread) / 2;
  requireThat(k > 0 && small > 0, 'Απροσδιόριστοι ημιάξονες έλλειψης.');
  const major = g * Math.sqrt(k / small), minor = g * Math.sqrt(k / large);
  const ec = Math.round(1e9 * Math.sqrt(Math.max(0, 1 - (minor / major) ** 2))) / 1e9;
  const ecCenter = [ox + g * zx, oy + g * zy];
  const angle = spread === 0 ? null : (Math.atan2(-B, C - A) * 90 / Math.PI + 180) % 180;
  return { circle_fit: { center_px: center, radius_px: radius, rms_px: rms },
    ellipse_fit: { center_px: ecCenter, semi_major_px: major, semi_minor_px: minor, angle_deg: angle,
      eccentricity: ec, tilt_flag: ec >= 0.20 } };
}

export function referenceDiameterPx(points, ellipse, outline, image) {
  if (outline.edge !== 'outer_silhouette') return 2 * ellipse.semi_major_px;
  // Τα κέντρα των δύο παράλληλων χείλων συμπίπτουν στην εγκάρσια διεύθυνση.
  const dx = outline.center_px[0] - (image.width_px - 1) / 2, dy = outline.center_px[1] - (image.height_px - 1) / 2;
  const length = Math.hypot(dx, dy);
  if (length === 0) return 2 * ellipse.semi_major_px;
  const transverse = points.map(([x, y]) => ((y - outline.center_px[1]) * dx - (x - outline.center_px[0]) * dy) / length);
  return Math.max(...transverse) - Math.min(...transverse);
}

function checkCircleReference(cal, outline, image) {
  const ref = cal.reference_circle, P = ref.points_px, circle = ref.circle_fit, ellipse = ref.ellipse_fit;
  const {circle_fit: c, ellipse_fit: e} = fitReference(P);
  const ecCenter = e.center_px;
  requireThat(circle.radius_px > 0 && circle.rms_px >= 0 && nearPoint(circle.center_px, c.center_px, 'px')
    && near(circle.radius_px, c.radius_px, 'px') && near(circle.rms_px, c.rms_px, 'px'), 'Ασυνεπής κύκλος αναφοράς.');
  const diameter = referenceDiameterPx(P, e, outline, image);
  requireThat(near(cal.reference_length_px, diameter, 'px'), outline.edge === 'outer_silhouette'
    ? 'Η διάμετρος της σιλουέτας διαφωνεί με τη μέτρηση στο εγκάρσιο πλάτος ή στον άξονα.'
    : 'Η διάμετρος αναφοράς σε px πρέπει να ισούται με τον μεγάλο άξονα 2a.');
  requireThat(nearPoint(ellipse.center_px, ecCenter, 'px') && ellipse.semi_major_px >= ellipse.semi_minor_px
    && ellipse.semi_minor_px > 0 && near(ellipse.semi_major_px, e.semi_major_px, 'px')
    && near(ellipse.semi_minor_px, e.semi_minor_px, 'px') && ellipse.eccentricity === e.eccentricity
    && ellipse.tilt_flag === e.tilt_flag, 'Ασυνεπείς άξονες, εκκεντρότητα ή σήμανση.');
  if (e.angle_deg === null) requireThat(ellipse.angle_deg === null, 'Κυκλική έλλειψη χωρίς ορισμένο μεγάλο άξονα.');
  else {
    const d = Math.abs(e.angle_deg - ellipse.angle_deg);
    requireThat(number(ellipse.angle_deg) && ellipse.angle_deg >= 0 && ellipse.angle_deg < 180,
      'Η αποθηκευμένη angle_deg πρέπει να ανήκει στο [0,180).');
    requireThat(near(Math.min(d, 180 - d), 0, 'deg'), 'Ασυνεπής προσανατολισμός έλλειψης.');
  }
  requireThat(P.every(p => dist(p, ecCenter) > 0), 'Κορυφή στο κέντρο της έλλειψης.');
  const angles = P.map(([x, y]) => Math.atan2(y - ecCenter[1], x - ecCenter[0]));
  const steps = angles.map((a, i) => wrappedDelta(angles[(i + 1) % P.length], a));
  const maxGap = Math.min(Math.PI / 4, 2 * (2 * Math.PI / P.length)) + 1e-9;
  requireThat(steps.every(d => d * steps[0] > 0 && Math.abs(d) <= maxGap)
    && near(Math.abs(sum(steps)) * 180 / Math.PI, 360, 'deg'), 'Η κυκλική αναφορά χρειάζεται πλήρη κάλυψη με μία φορά.');

  const reps = ref.diameter_repeats_px;
  requireThat(ref.diameter_floor_std_px >= 0 && (reps.length === 0 || (within(reps.length, 2, 64)
    && reps.every(d => d > 0) && near(cal.reference_length_px, reps[0], 'px'))), 'Μη έγκυρη τεκμηρίωση επαναληψιμότητας διαμέτρου.');
  let repeatStd = 0;
  if (reps.length) {
    const average = mean(reps);
    repeatStd = Math.sqrt(sum(reps.map(x => (x - average) ** 2)) / (reps.length - 1));
  }
  requireThat(near(cal.reference_uncertainty_px, Math.hypot(ref.diameter_floor_std_px, repeatStd), 'px'),
    'Η αβεβαιότητα διαμέτρου δεν συμφωνεί με τις συνιστώσες της.');
}

const sameOptional = (stored, expected, unit) => expected === null ? stored === null : stored >= 0 && near(stored, expected, unit);

// Η απόσταση των δύο κέντρων στην εικόνα προκύπτει με προβολή στο άνω και στο κάτω επίπεδο.
export function rimParallaxPx(outline, D, height) {
  if (outline.thickness_mm === 0 || outline.center_offset_px === 0) return 0;
  if ([D, height, outline.thickness_mm].includes(null)) return null;
  return outline.center_offset_px * outline.thickness_mm / (D - height + outline.thickness_mm);
}

function checkOutline(outline, m, height) {
  const imageCenter = [(m.image.width_px - 1) / 2, (m.image.height_px - 1) / 2];
  requireThat(outline.center_offset_px >= 0 && near(outline.center_offset_px, dist(outline.center_px, imageCenter), 'px'),
    'Η απόσταση του κέντρου του αντικειμένου από το κέντρο της εικόνας διαφωνεί με τις συντεταγμένες.');
  const t = outline.thickness_mm;
  requireThat(outline.edge === 'planar_trace' ? t === 0 :
    ['upper_rim', 'outer_silhouette', 'unresolved'].includes(outline.edge) && (t === null || t > 0),
    'Δήλωσε επίπεδη χάραξη ή ποιο χείλος του αντικειμένου φαίνεται, μαζί με το πάχος του.');
  requireThat(sameOptional(outline.parallax_px, rimParallaxPx(outline, m.view.camera_distance_mm, height), 'px'),
    'Το περιθώριο παράλλαξης σε px διαφωνεί με το πάχος και τη θέση του αντικειμένου.');
}

// Για σιλουέτα παράλληλου κυκλικού δίσκου: ρ ≤ dist(P,C_άνω) ≤ ρ + δ.
function topRadiusRange(outline, points, nominal) {
  if (outline.edge === 'unresolved') return null;
  if (outline.edge !== 'outer_silhouette') return [nominal, nominal];
  if (outline.parallax_px === null) return null;
  const measured = mean(points.map(p => dist(p, outline.center_px)));
  return [Math.max(0, measured - outline.parallax_px), measured];
}

function referenceScaleRange(m) {
  const c = m.calibration, ref = m.view.reference_outline;
  if (['planar_trace', 'upper_rim'].includes(ref.edge)) return [c.reference_mm_per_px, c.reference_mm_per_px];
  const range = topRadiusRange(ref, c.reference_circle?.points_px ?? [], c.reference_length_px / 2);
  if (!range || range[0] <= 0) return null;
  return [c.reference_length_mm / (2 * range[1]), c.reference_length_mm / (2 * range[0])];
}

export function rimSystematics(m, radiusPx) {
  const c = m.calibration, scales = referenceScaleRange(m);
  if (!scales) return { reference: null, radius: null };
  const reference = Math.max(...scales.map(s => Math.abs(s - c.reference_mm_per_px)));
  if (radiusPx === undefined) return { reference, radius: null };
  const outline = m.view.contour_outline;
  if (reference === 0 && ['planar_trace', 'upper_rim'].includes(outline.edge)) return { reference, radius: 0 };
  const radii = topRadiusRange(outline, pointsOf(m), radiusPx);
  if (!radii || [m.view.camera_distance_mm, m.view.reference_height_mm, m.view.contour_height_mm].includes(null)) return { reference, radius: null };
  const k = c.mm_per_px / c.reference_mm_per_px, R = radiusPx * c.mm_per_px;
  const low = k * scales[0] * radii[0], high = k * scales[1] * radii[1];
  return { reference, radius: Math.max(Math.abs(R - low), Math.abs(high - R)) };
}

function checkScale(m) {
  const cal = m.calibration, view = m.view, L = cal.reference_length_mm, p = cal.reference_length_px;
  checkOutline(view.reference_outline, m, view.reference_height_mm);
  checkOutline(view.contour_outline, m, view.contour_height_mm);
  if (cal.reference_circle) checkCircleReference(cal, view.reference_outline, m.image);
  else {
    const measured = dist(...cal.reference_endpoints_px);
    requireThat(measured > 0 && near(p, measured, 'px'), 'Το μήκος αναφοράς σε px δεν συμφωνεί με τα άκρα.');
  }
  if (cal.reference_endpoints_px) requireThat(view.reference_outline.edge === 'planar_trace' && nearPoint(view.reference_outline.center_px,
      cal.reference_endpoints_px[0].map((v, j) => (v + cal.reference_endpoints_px[1][j]) / 2), 'px'),
      'Το κέντρο της αναφοράς-τμήματος πρέπει να είναι το μέσο των δύο άκρων της.');
  if (cal.reference_circle && view.reference_outline.edge === 'upper_rim') requireThat(
      nearPoint(view.reference_outline.center_px, cal.reference_circle.ellipse_fit.center_px, 'px'),
      'Το κέντρο του άνω χείλους αναφοράς πρέπει να συμφωνεί με το κέντρο της έλλειψης.');
  const s0 = L / p, up = cal.reference_uncertainty_px, unsafeReference = up / p > 0.05;
  const rim = rimSystematics(m);
  requireThat(sameOptional(cal.reference_rim_systematic_mm_per_px, rim.reference, 'mm/px'),
    'Ασυνεπές συστηματικό περιθώριο της αναφοράς από το πάχος και τη θέση.');
  const u0 = unsafeReference ? null : U(cal.reference_uncertainty_mm / p, L * up / (p * p), -cal.length_correlation_unitless);
  requireThat(near(cal.reference_mm_per_px, s0, 'mm/px') && (u0 === null ? cal.reference_scale_uncertainty_mm_per_px === null
    : near(cal.reference_scale_uncertainty_mm_per_px, u0, 'mm/px')), 'Ασυνεπής κλίμακα ή αβεβαιότητα αναφοράς.');
  const D = view.camera_distance_mm, hr = view.reference_height_mm, ho = view.contour_height_mm;
  const known = ![D, hr, ho].includes(null), B = D - hr, F = D - ho, k = known ? F / B : 1;
  const uD = view.camera_distance_u_mm, ur = view.reference_height_u_mm, uo = view.contour_height_u_mm;
  let status, us = null;
  if (cal.reference_circle?.ellipse_fit.tilt_flag) status = 'tilt_flagged';
  else if (!known) status = 'unknown_geometry';
  else if ([uD, ur, uo].includes(null)) status = 'unknown_height_uncertainty';
  else if (rim.reference === null) status = 'unknown_rim';
  else if (unsafeReference || Math.hypot(uD, ur) / B > 0.05 || Math.hypot(uD, uo) / F > 0.05) status = 'nonlinear';
  else {
    status = 'usable';
    const uk = Math.hypot((ho - hr) * uD / (B * B), k * ur / B, uo / B);
    us = Math.hypot(k * u0, s0 * uk);
  }
  requireThat(near(cal.mm_per_px, s0 * k, 'mm/px') && cal.scale_status === status
    && (us === null ? cal.scale_uncertainty_mm_per_px === null : near(cal.scale_uncertainty_mm_per_px, us, 'mm/px')),
    'Ασυνεπής διόρθωση ύψους, κατάσταση ή αβεβαιότητα κλίμακας.');
}

// Μετά την απαλοιφή του R, η παράγωγος του υπολοίπου είναι gᵢ − μέσο(g).
function circleIteration(points, weights, cx, cy) {
  const differences = [], gx = [], gy = [], centerNorm = Math.hypot(cx, cy);
  if (!(centerNorm <= 1e8)) return null;
  let meanDifference = 0, ux = 0, uy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i], dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy);
    if (d <= 1e-15) return null;
    // dᵢ−‖c‖ με διαφορά τετραγώνων, ώστε ο μεγάλος R ρηχού τόξου να μην εξαφανίζει το υπόλοιπο.
    const diff = (x * x + y * y - 2 * (cx * x + cy * y)) / (d + centerNorm);
    differences.push(diff); gx.push(dx / d); gy.push(dy / d);
    meanDifference += weights[i] * diff; ux += weights[i] * gx[i]; uy += weights[i] * gy[i];
  }
  let loss = 0, xx = 0, xy = 0, yy = 0, bx = 0, by = 0;
  for (let i = 0; i < points.length; i++) {
    const x = gx[i] - ux, y = gy[i] - uy, e = differences[i] - meanDifference, w = weights[i];
    loss += w * e * e; xx += w * x * x; xy += w * x * y; yy += w * y * y;
    bx += w * x * e; by += w * y * e;
  }
  const det = xx * yy - xy * xy;
  if (det <= 1e-18 * (xx + yy) ** 2 || !number(det)) return null;
  return { cx, cy, radius: centerNorm + meanDifference, loss, dx: (xy * by - yy * bx) / det, dy: (xy * bx - xx * by) / det };
}

function minimizeCircle(points, weights, start) {
  let state = circleIteration(points, weights, ...start);
  for (let iteration = 0; state && iteration < 100; iteration++) {
    const {cx, cy, dx, dy, loss, radius} = state;
    if (loss < 1e-28 || Math.hypot(dx, dy) <= 1e-11 * (1 + radius)) return state;
    let next = null;
    for (let fraction = 1; fraction >= 1 / 65536; fraction /= 2) {
      const candidate = circleIteration(points, weights, cx + fraction * dx, cy + fraction * dy);
      if (candidate && candidate.loss <= loss) { next = candidate; break; }
    }
    if (!next) return Math.hypot(dx, dy) <= 1e-8 * (1 + radius) ? state : null;
    if (next.cx === cx && next.cy === cy) return Math.hypot(dx, dy) <= 1e-8 * (1 + radius) ? state : null;
    state = next;
  }
  return null;
}

export function fitK5(P, closed) {
  if (P.length < 3) return null;
  const lengths = edgeLengths(P, closed), perimeter = sum(lengths);
  if (!(perimeter > 0)) return null;
  const w = P.map((_, i) => ((lengths[i] ?? 0) + (i ? lengths[i - 1] : closed ? lengths.at(-1) : 0)) / (2 * perimeter));
  const ox = sum(P.map((p, i) => w[i] * p[0])), oy = sum(P.map((p, i) => w[i] * p[1]));
  const scale = Math.max(...P.map(p => Math.hypot(p[0] - ox, p[1] - oy)));
  const points = P.map(([x, y]) => [(x - ox) / scale, (y - oy) / scale]);
  let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0;
  for (let i = 0; i < P.length; i++) {
    const [x, y] = points[i], z = x * x + y * y;
    xx += w[i] * x * x; xy += w[i] * x * y; yy += w[i] * y * y;
    xz += w[i] * x * z; yz += w[i] * y * z;
  }
  const det = xx * yy - xy * xy, largest = (xx + yy + Math.hypot(xx - yy, 2 * xy)) / 2;
  const lineLoss = det / largest;
  if (!(lineLoss > 1e-14)) return null;
  const algebraic = [(yy * xz - xy * yz) / (2 * det), (xx * yz - xy * xz) / (2 * det)];
  const angle = Math.atan2(2 * xy, xx - yy) / 2, nx = -Math.sin(angle), ny = Math.cos(angle);
  const starts = [algebraic, [0, 0], [nx, ny], [-nx, -ny], [ny, -nx], [-ny, nx]];
  const fits = [];
  for (const start of starts) {
    const fit = minimizeCircle(points, w, start);
    if (!fit) continue;
    fits.push(fit);
    if (fit.loss < 1e-28) break;
  }
  fits.sort((a, b) => a.loss - b.loss);
  const best = fits[0];
  if (!best || best.loss >= lineLoss * (1 - 1e-10)) return null;
  for (const other of fits.slice(1)) {
    if (other.loss - best.loss <= 1e-12 * Math.max(1e-8, best.loss)
      && Math.hypot(other.cx - best.cx, other.cy - best.cy) > 1e-6 * (1 + best.radius)) return null;
  }
  return { center_px: [ox + scale * best.cx, oy + scale * best.cy], radius_px: scale * best.radius };
}

export function exporterK5(m) {
  const fit = fitK5(pointsOf(m), m.selection.mode === 'full');
  if (!fit) return { definition: K5_DEFINITION, status: 'no_stable_circle', center_px: null, radius_px: null, radius_mm: null };
  return { definition: K5_DEFINITION, status: 'ok', ...fit, radius_mm: m.calibration.mm_per_px * fit.radius_px };
}

function checkK5(m) {
  const expected = exporterK5(m), saved = m.exporter_k5;
  requireThat(saved.definition === expected.definition && saved.status === expected.status,
    'Λάθος ορισμός ή κατάσταση Κ5 του εξαγωγέα.');
  const available = expected.status === 'ok';
  requireThat(available ? saved.center_px && saved.radius_px > 0 && saved.radius_mm > 0
    && nearPoint(expected.center_px, saved.center_px, 'px') && near(expected.radius_px, saved.radius_px, 'px')
    && near(expected.radius_mm, saved.radius_mm, 'mm') : saved.center_px === null && saved.radius_px === null && saved.radius_mm === null,
    'Ο Κ5 του εξαγωγέα διαφωνεί με τη γεωμετρική προσαρμογή των επιλεγμένων σημείων.');
  const onCircle = available && m.selection.measurability === 'at_or_above_limit'
    && pointsOf(m).every(p => near(dist(p, expected.center_px), expected.radius_px, 'px'));
  const differences = [];
  for (const {raw, derived} of m.methods) if (raw.status === 'ok') {
    requireThat(available ? near(derived.radius_minus_k5_mm, raw.radius_mm - saved.radius_mm, 'mm') : derived.radius_minus_k5_mm === null,
      'Η αποθηκευμένη διαφορά ακτίνας μεθόδου μείον Κ5 είναι λανθασμένη.');
    if (onCircle) requireThat(near(derived.circle_radius_px, saved.radius_px, 'px'),
      'Η ακτίνα της μεθόδου σε px διαφωνεί με τον Κ5 σε μετρήσιμα ομοκυκλικά σημεία.');
    if (available) differences.push(raw.method_id + ' ' + derived.radius_minus_k5_mm + ' mm');
  }
  if (!available) return 'Δεν προέκυψε σταθερός πεπερασμένος Κ5 για τα επιλεγμένα σημεία.';
  if (differences.length) return 'Ελέγχθηκε ο Κ5 του εξαγωγέα. Διαφορές μεθόδων από τον Κ5 σε mm · ' + differences.join(', ');
}

export function checkMeasurement(jsonText, { forEvaluation = false } = {}) {
  const results = [], byId = new Map();
  let m;
  function run(n, dependencies, label, action) {
    const id = `Ε${n}`;
    const failed = dependencies.map(d => `Ε${d}`).filter(d => !byId.get(d)?.passed);
    let result;
    if (failed.length) result = { id, passed: false, message: `Δεν εκτελέστηκε: απέτυχαν οι ${failed.join(', ')}.` };
    else {
      try {
        const detail = action(); result = { id, passed: true, message: detail ?? `Πέρασε: ${label}.` };
      } catch (error) {
        let message = n === 1 ? 'Μη έγκυρο JSON, διπλά κλειδιά, υπέρβαση βάθους ή μη πεπερασμένος αριθμός.'
          : error instanceof Error ? error.message : 'Ο έλεγχος απέτυχε.';
        if (n === 2 && typeof m?.interface_version === 'string' && !INTERFACES.includes(m.interface_version)) {
          message += ' ' + interfaceMessage(m.interface_version);
        } else if (n === 2 && ['0.1', '0.2'].includes(m?.format_version)) {
          message += ` Βρέθηκε μορφή ${m.format_version}. Για επανεξαγωγή σε 0.3 χρειάζονται τα νέα στοιχεία της λήψης.`;
        }
        result = { id, passed: false, message };
      }
    }
    results.push(result); byId.set(id, result);
  }

  run(1, [], 'JSON', () => { m = parseStrict(jsonText); });
  run(2, [1], 'δομή και τύποι', () => structure(m, SCHEMA));
  run(3, [2], 'προέλευση και εκδόσεις', () => {
    requireThat(INTERFACES.includes(m.interface_version), interfaceMessage(m.interface_version));
    requireThat(m.format_version === '0.3' && m.contract_version === '0.3'
      && m.maturity === 'Πειραματικό' && m.subject === 'object' && ['συνθετικό', 'αντικείμενο'].includes(m.provenance),
      'Λάθος έκδοση, προέλευση ή σήμανση.');
    requireThat(VERSION.test(m.software.exporter_version) && (m.software.generator !== null) === (m.provenance === 'συνθετικό')
      && (!m.software.generator || VERSION.test(m.software.generator.generator_version)), 'Ασυνεπής δήλωση λογισμικού.');
    requireThat(['evaluation', 'measurement'].includes(m.measurement_purpose), 'Άγνωστος σκοπός αρχείου μέτρησης.');
    for (const method of m.methods) {
      requireThat(VERSION.test(method.raw.method_version) && method.raw.maturity === 'Πειραματικό' && method.raw.provenance === 'εκτίμηση',
        'Λάθος έκδοση ή σήμανση εξόδου.');
      requireThat(method.output_origin === 'executed_method' || (method.output_origin === 'synthetic_fixture' && m.provenance === 'συνθετικό'),
        'Ασυνεπής προέλευση εξόδου μεθόδου.');
    }
    const executed = m.methods.some(method => method.output_origin === 'executed_method');
    requireThat(executed ? ['browser_unisolated', 'node_isolated_process'].includes(m.software.method_execution)
      : m.software.method_execution === 'fixture_only', 'Ασυνεπής δήλωση περιβάλλοντος εκτέλεσης.');
  });
  run(4, [2], 'δηλώσεις γεωμετρίας', () => {
    const v = m.view, hr = v.reference_height_mm, ho = v.contour_height_mm;
    const plane = hr === null || ho === null ? 'unknown' : hr === ho ? 'equal_nominal_heights' : 'different_nominal_heights';
    requireThat(v.projection === 'normal_pinhole_assumed' && v.optical_axis_normal === 'assumed_unverified'
      && v.negligible_lens_distortion === 'assumed_unverified' && v.same_plane === plane, 'Ασυνεπής δήλωση όψης ή επιπέδων.');
    requireThat(m.frame.x_axis === 'right' && m.frame.y_axis === 'up' && m.frame.z_axis === 'toward_camera'
      && m.frame.handedness === 'right', 'Λάθος φορά αξόνων CAD.');
    requireThat(m.contour.curve_kind === 'projected_object_boundary' && m.selection.sampling === 'as_stored_no_resampling'
      && m.calibration.uncertainty_assumptions === 'declared_unverified' && m.methods.every(method =>
        method.radius_definition === DEFINITIONS.get(method.raw.method_id) && method.uncertainty_assumptions === 'declared_unverified'),
      'Λάθος δήλωση καμπύλης, ακτίνας ή παραδοχών αβεβαιότητας.');
  });
  run(5, [2], 'σταθερές ελέγχου', () => {
    requireThat(Object.entries(PROFILE).every(([k, v]) => m.validation[k] === v), 'Αλλοιωμένη ανοχή ή όριο λογικής.');
  });
  run(6, [2], 'πεδίο εικόνας', () => {
    const { width_px: w, height_px: h } = m.image, c = m.calibration;
    requireThat(within(w, 1, 100000) && within(h, 1, 100000), 'Διαστάσεις εικόνας εκτός ορίων.');
    const inImage = p => within(p[0], 0, w - 1) && within(p[1], 0, h - 1);
    function trace(points, minimum) {
      requireThat(within(points.length, minimum, 4096) && points.every(inImage)
        && new Set(points.map(p => JSON.stringify(p))).size === points.length, 'Εκτός ορίων ή επαναλαμβανόμενα σημεία περιγράμματος.');
    }
    trace(m.contour.points_px, 5);
    checkInsertions(m.contour);
    if (c.reference_circle) trace(c.reference_circle.points_px, 8);
    requireThat([m.view.reference_outline.center_px, m.view.contour_outline.center_px,
      m.frame.origin_px, m.selection.anchor_probe_px, m.selection.anchor_px,
      ...(c.reference_endpoints_px ?? []), ...(c.control_segment?.endpoints_px ?? [])].every(inImage), 'Σημείο έξω από την εικόνα.');
  });
  run(7, [2], 'πηγή εικόνας και είδος αναφοράς', () => {
    const c = m.calibration, image = m.image.image_id;
    requireThat(c.image_id === image && m.contour.image_id === image && ![m.contour.contour_id, m.contour.original_contour_id].includes(c.reference_id),
      'Ασυνεπής ταυτότητα εικόνας ή αναφοράς.');
    const synthetic = m.provenance === 'συνθετικό', object = m.provenance === 'αντικείμενο';
    const circle = c.reference_kind === 'known_diameter_circle' && (synthetic || object);
    const segment = (synthetic && c.reference_kind === 'synthetic_segment') || (object && c.reference_kind === 'object_segment');
    requireThat((circle && c.reference_circle !== null && c.reference_endpoints_px === null)
      || (segment && c.reference_circle === null && c.reference_endpoints_px !== null), 'Ασυνεπές είδος αναφοράς.');
    const control = c.control_segment;
    if (control) requireThat(control.image_id === image && control.plane === 'reference_plane'
      && ![c.reference_id, m.contour.contour_id, m.contour.original_contour_id].includes(control.reference_id), 'Ασυνεπής ταυτότητα ανεξάρτητου τμήματος.');
  });
  run(8, [2], 'μονάδες και πρωτογενείς αβεβαιότητες', () => {
    const c = m.calibration, v = m.view, source = c.reference_input;
    const factor = new Map([['mm', 1], ['cm', 10], ['in', 25.4]]).get(source.unit);
    requireThat(factor !== undefined && [source.value, c.reference_length_mm, c.reference_length_px, c.reference_mm_per_px, c.mm_per_px].every(x => x > 0)
      && near(c.reference_length_mm, factor * source.value, 'mm') && near(c.reference_uncertainty_mm, factor * source.standard_uncertainty, 'mm'),
      'Ασυνεπής μονάδα, κλίμακα ή μήκος αναφοράς.');
    requireThat([source.standard_uncertainty, c.reference_uncertainty_mm, c.reference_uncertainty_px].every(u => validStd(u, m))
      && [c.reference_scale_uncertainty_mm_per_px, c.scale_uncertainty_mm_per_px].every(u => u === null || validStd(u, m))
      && within(c.length_correlation_unitless, -1, 1), 'Ασυνεπής αβεβαιότητα ή συσχέτιση αναφοράς.');
    checkKnownLength(c.reference_kind, c.reference_length_mm, 'αναφοράς');
    const D = v.camera_distance_mm;
    for (const key of ['camera_distance', 'reference_height', 'contour_height']) {
      const value = v[key + '_mm'], u = v[key + '_u_mm'];
      requireThat(value === null ? u === null : (u === null || validStd(u, m)) && (key === 'camera_distance' ? value > 0
        : value >= 0 && (D === null || value < D)), 'Ασυνεπής απόσταση, ύψος ή τυπική αβεβαιότητα.');
    }
  });
  run(9, [6, 7, 8], 'κλείσιμο κλίμακας και ύψη', () => checkScale(m));
  run(10, [6, 9], 'επιλογή, άγκυρα και βέλος', () => checkSupport(m));
  run(11, [10], 'μετασχηματισμός CAD', () => {
    const P = pointsOf(m);
    requireThat(m.frame.selected_points_mm.length === P.length && P.every((p, i) => sameCAD(m.frame.selected_points_mm[i], cad(p, m))),
      'Ασυνεπή σημεία CAD ή ύψος επιπέδου.');
  });
  run(12, [2], 'αποτέλεσμα, άρνηση και σημασία αβεβαιότητας', () => {
    requireThat(METHODS.every(id => m.methods.some(x => x.raw.method_id === id)), 'Λείπει ή επαναλαμβάνεται μέθοδος.');
    for (const method of m.methods) {
      const { raw: r, derived: d, uncertainty_model: model } = method;
      const below = m.selection.measurability === 'not_measurable' && r.status === 'ok';
      requireThat(method.measurability_flag === (below ? 'ok_below_sagitta_limit' : 'none'),
        'Η αριθμητική απάντηση σε μη μετρήσιμη επιλογή χρειάζεται τη σωστή σήμανση ok_below_sagitta_limit.');
      requireThat((model.kind === 'one_sigma_target' && model.width_ratio > 0) || (model.kind === 'conservative' && model.width_ratio > 1),
        'Μη έγκυρη σημασία ή λόγος εύρους αβεβαιότητας.');
      if (r.status === 'ok') {
        requireThat(r.radius_mm > 0 && r.radius_uncertainty_mm > 0
          && Array.isArray(r.center_px) && r.reason === null && record(d), 'Ασυνεπές επιτυχές αποτέλεσμα μεθόδου.');
      } else {
        requireThat(r.status === 'abstain' && r.radius_mm === null && r.radius_uncertainty_mm === null && r.center_px === null
          && d === null && method.scale_radius_correlation_unitless === null && typeof r.reason === 'string' && r.reason.trim().length > 0,
          'Η άρνηση χρειάζεται αιτιολογία και null στα αποτελέσματα.');
      }
    }
    if (m.methods.some(method => method.measurability_flag === 'ok_below_sagitta_limit')) {
      return 'Αριθμητική απάντηση σε μη μετρήσιμη επιλογή. Καταγράφεται χωριστά στην αξιολόγηση.';
    }
  });
  run(13, [10, 12], 'μονάδες διαγνωστικών', () => {
    const units = new Set(['px', 'mm', 'deg', 'count', '1', 'px^2', 'mm^2', 'mm/px']);
    const escape = key => key.replace(/~/g, '~0').replace(/\//g, '~1');
    for (const method of m.methods) {
      const leaves = new Map(), d = method.raw.diagnostics, declared = method.diagnostic_units;
      const visit = (v, path) => {
        if (typeof v === 'number') leaves.set(path, v);
        else if (v !== null && typeof v === 'object') {
          for (const [k, item] of Object.entries(v)) visit(item, `${path}/${escape(k)}`);
        }
      };
      visit(d, '');
      requireThat(Object.keys(declared).length === leaves.size
        && [...leaves.keys()].every(k => own(declared, k) && units.has(declared[k])), 'Ελλιπής, επιπλέον ή άγνωστη μονάδα διαγνωστικού.');
      for (const [key, unit, predicate] of [
        ['n_points', 'count', v => Number.isInteger(v) && v === m.selection.point_indices_unitless.length],
        ['arc_angle_deg', 'deg', v => within(v, 0, 360) || near(v, 0, 'deg') || near(v, 360, 'deg')],
        ['rms_residual_px', 'px', v => number(v) && v >= 0],
      ]) if (own(d, key)) {
        if (d[key] === null) requireThat(method.raw.status === 'abstain', 'Null διαγνωστικό επιτρέπεται μόνο σε άρνηση.');
        else requireThat(predicate(d[key]) && declared[`/${key}`] === unit, `Λάθος τιμή ή μονάδα διαγνωστικού ${key}.`);
      }
    }
  });
  run(14, [9, 12], 'αντίγραφα ακτίνας και κέντρου', () => {
    for (const { raw: r, derived: d } of m.methods) if (r.status === 'ok') {
      requireThat(d.circle_radius_px > 0 && near(d.arc_circle_radius_mm, r.radius_mm, 'mm')
        && near(r.radius_mm, m.calibration.mm_per_px * d.circle_radius_px, 'mm') && sameCAD(d.center_mm, cad(r.center_px, m)),
        'Ασυνεπή αντίγραφα ακτίνας ή μετασχηματισμένου κέντρου.');
    }
  });
  run(15, [10, 14], 'υπόλοιπα, σάρωση και πρόσημο', () => {
    const P = pointsOf(m), A = m.selection.anchor_px, n = m.selection.outward_normal_cad;
    for (const { raw: r, derived: d } of m.methods) if (r.status === 'ok') {
      const center = r.center_px, distances = P.map(p => dist(p, center));
      const rms = Math.sqrt(mean(distances.map(x => (x - d.circle_radius_px) ** 2)));
      requireThat(d.radial_rms_px >= 0 && near(d.radial_rms_px, rms, 'px'), 'Ασυνεπές γεωμετρικό RMS.');
      if (distances.includes(0)) requireThat(d.sweep_about_center_deg === null, 'Απροσδιόριστη γωνία σε σημείο που συμπίπτει με το κέντρο.');
      else {
        const theta = P.map(p => Math.atan2(center[1] - p[1], p[0] - center[0]));
        const edges = m.selection.mode === 'full' ? P.length : P.length - 1;
        let sweep = 0;
        for (let i = 0; i < edges; i++) sweep += wrappedDelta(theta[(i + 1) % P.length], theta[i]);
        requireThat(near(d.sweep_about_center_deg, sweep * 180 / Math.PI, 'deg'), 'Ασυνεπής γωνιακή σάρωση.');
      }
      const dot = n === null ? 0 : (center[0] - A[0]) * n[0] + (A[1] - center[1]) * n[1];
      const sign = Math.abs(dot) <= 1e-7 ? 'undetermined' : dot < 0 ? 'convex' : 'concave';
      requireThat(number(dot) && d.curvature_sign === sign, 'Ασυνεπές πρόσημο ως προς την πλευρά του υλικού.');
    }
  });
  run(16, [9, 10, 12], 'τυπική αβεβαιότητα και συστηματικό περιθώριο', () => {
    const s = m.calibration.mm_per_px, us = m.calibration.scale_uncertainty_mm_per_px;
    for (const method of m.methods) if (method.raw.status === 'ok') {
      const r = method.raw, d = method.derived, t = method.scale_radius_correlation_unitless;
      const bound = rimSystematics(m, r.radius_mm / s).radius;
      requireThat(sameOptional(d.radius_rim_systematic_mm, bound, 'mm'), 'Ασυνεπές συστηματικό περιθώριο ακτίνας από τα χείλη.');
      let standard = null;
      if (method.uncertainty_model.kind === 'one_sigma_target' && us !== null) {
        requireThat(within(t, -1, 1), 'Απαιτείται συσχέτιση ακτίνας και κλίμακας στο [−1,1].');
        standard = U(r.radius_uncertainty_mm, r.radius_mm / s * us, t);
        requireThat(validStd(d.radius_standard_uncertainty_mm, m), 'Μη έγκυρη τυπική αβεβαιότητα ακτίνας.');
      } else requireThat(t === null, 'Η συσχέτιση πρέπει να είναι null.');
      const total = standard === null || bound === null ? null : standard + bound;
      requireThat(sameOptional(d.radius_standard_uncertainty_mm, standard, 'mm') && sameOptional(d.radius_total_uncertainty_mm, total, 'mm')
        && (total === null || validStd(d.radius_total_uncertainty_mm, m)), 'Ασυνεπής τυπική αβεβαιότητα ή συνολικό περιθώριο ακτίνας.');
    }
  });
  run(17, [12], 'όρια λογικής', () => {
    requireThat(within(m.calibration.mm_per_px, PROFILE.scale_min_mm_per_px, PROFILE.scale_max_mm_per_px),
      'Η κλίμακα υπερβαίνει τα όρια λογικής της 0.3.');
    requireThat(m.methods.every(x => x.raw.status === 'abstain' || within(x.raw.radius_mm, PROFILE.radius_min_mm, PROFILE.radius_max_mm)),
      'Η ακτίνα υπερβαίνει τα όρια λογικής της 0.3.');
  });
  run(18, [10, 14], 'Κ5 εξαγωγέα και διαφορά κάθε μεθόδου', () => checkK5(m));
  run(19, [6, 7, 9], 'ανεξάρτητο τμήμα ελέγχου', () => {
    const c = m.calibration, control = c.control_segment;
    if (m.measurement_purpose === 'evaluation') requireThat(control,
      'Στο αρχείο αξιολόγησης απαιτείται δεύτερο γνωστό μήκος (control_segment) για ανεξάρτητο έλεγχο βαθμονόμησης.');
    if (forEvaluation) requireThat(m.measurement_purpose === 'evaluation' && m.provenance === 'αντικείμενο',
      'Για αξιολόγηση φωτογραφίας απαιτούνται σκοπός evaluation και προέλευση αντικείμενο.');
    requireThat(c.independent_check === (control ? 'provided' : 'absent'), 'Η δήλωση ανεξάρτητου ελέγχου διαφωνεί με την παρουσία του control_segment.');
    if (!control) return 'Απλή μέτρηση χωρίς ανεξάρτητο έλεγχο βαθμονόμησης. Δεν γίνεται δεκτή για αξιολόγηση.';
    const segmentKind = m.provenance === 'συνθετικό' ? 'synthetic_segment' : 'object_segment';
    requireThat([segmentKind, 'known_diameter_circle'].includes(control.reference_kind), 'Άγνωστο είδος δεύτερου γνωστού μήκους.');
    checkKnownLength(control.reference_kind, control.length_mm, 'ανεξάρτητου ελέγχου');
    const [a, b] = control.endpoints_px, p2 = dist(a, b), L2 = control.length_mm;
    const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const opticalCenter = [(m.image.width_px - 1) / 2, (m.image.height_px - 1) / 2];
    requireThat(control.center_offset_px >= 0 && near(control.center_offset_px, dist(midpoint, opticalCenter), 'px'),
      'Η απόσταση του κέντρου του δεύτερου γνωστού μήκους από το κέντρο της εικόνας είναι λανθασμένη.');
    requireThat(c.reference_scale_uncertainty_mm_per_px !== null,
      'Το αποθηκευμένο reference_scale_uncertainty_mm_per_px είναι null (up/p>0.05). Ο ανεξάρτητος έλεγχος βαθμονόμησης δεν υπολογίζεται.');
    requireThat(p2 > 0 && L2 > 0 && validStd(control.length_u_mm, m) && validStd(control.length_u_px, m)
      && control.length_u_px / p2 <= 0.05,
      'Μη έγκυρη διάσταση ή αβεβαιότητα ανεξάρτητου τμήματος.');
    if (c.reference_endpoints_px) {
      const [l, r] = c.reference_endpoints_px;
      requireThat(!((comparePoint(a, l) === 0 && comparePoint(b, r) === 0)
        || (comparePoint(a, r) === 0 && comparePoint(b, l) === 0)), 'Το δεύτερο τμήμα επαναλαμβάνει το πρώτο.');
    } else {
      const e = c.reference_circle.ellipse_fit, phi = (e.angle_deg ?? 0) * Math.PI / 180;
      const onRim = ([x, y]) => {
        const dx = x - e.center_px[0], dy = y - e.center_px[1];
        return near(Math.hypot((dx * Math.cos(phi) + dy * Math.sin(phi)) / e.semi_major_px,
          (-dx * Math.sin(phi) + dy * Math.cos(phi)) / e.semi_minor_px), 1, '1');
      };
      requireThat(!(nearPoint(midpoint, e.center_px, 'px') && onRim(a) && onRim(b)),
        'Το δεύτερο μήκος επαναχρησιμοποιεί διάμετρο της κυκλικής αναφοράς.');
    }
    const p = c.reference_length_px, L = c.reference_length_mm, s0 = L / p, s2 = L2 / p2;
    const u0 = U(c.reference_uncertainty_mm / p, L * c.reference_uncertainty_px / (p * p), -c.length_correlation_unitless);
    const u2 = Math.hypot(control.length_u_mm / p2, L2 * control.length_u_px / (p2 * p2));
    const threshold = 2 * Math.hypot(u0, u2) + ABS['mm/px'] + 1e-9 * Math.max(Math.abs(s0), Math.abs(s2));
    requireThat(number(threshold) && Math.abs(s2 - s0) <= threshold, 'Η κλίμακα διαφωνεί με το ανεξάρτητο τμήμα.');
  });
  return results;
}
