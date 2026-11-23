// Πειραματικό · V2-core-js-003 · 0.1.2
// Προέλευση: V2-core-js-002 και διάγνωση με αφαίρεση μίας όψης.

export const VERSION = '0.1.2';

const LABEL = `Πειραματικό · V2-core-js-003 · ${VERSION}`;
const DEFAULT_CARD_MM = [85.60, 53.98];
const UNIT_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const WARNING_LIMITS = {
  minViewSpreadDeg: 15, // προσωρινό
  maxDisagreementPct: 3, // προσωρινό
  maxLeaveOneOutChangePct: 5, // προσωρινό
  maxBowRmsPx: 0.75, // προσωρινό
  maxCardRmsPx: 1.5, // προσωρινό
  expectedScanOk: true, // προσωρινό: η σάρωση που εκτελέστηκε πρέπει να δώσει λύση
  maxViewEdgeRmsRatio: 1.6, // προσωρινό
  maxEndMissPx: 2.5, // προσωρινό
  viewCheckStatistic: 4.7, // προσωρινό
  viewCheckSeparation: 2.3, // προσωρινό
};
const REFUSAL_LIMITS = {
  maxCardRmsDiagonalFraction: 0.05,
  minSagittaSigmaRatio: 3,
};

function refusal(code, message) {
  return { ok: false, code, message: `${LABEL}. ${message}` };
}

function isPoint2(point) {
  return Array.isArray(point) && point.length === 2
    && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]];
}

function scale(v, factor) {
  return [factor * v[0], factor * v[1], factor * v[2]];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function rotate(r, [x, y, z]) {
  return [r[0] * x + r[1] * y + r[2] * z, r[3] * x + r[4] * y + r[5] * z,
    r[6] * x + r[7] * y + r[8] * z];
}

function rotateTranspose(r, [x, y, z]) {
  return [r[0] * x + r[3] * y + r[6] * z, r[1] * x + r[4] * y + r[7] * z,
    r[2] * x + r[5] * y + r[8] * z];
}

function multiplyMatrices(a, b) {
  const product = new Array(9);
  for (let i = 0; i < 9; i += 3) {
    for (let j = 0; j < 3; j++) {
      product[i + j] = a[i] * b[j] + a[i + 1] * b[3 + j] + a[i + 2] * b[6 + j];
    }
  }
  return product;
}

function rotationIncrement([x, y, z]) {
  const angle = Math.hypot(x, y, z);
  if (angle === 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];

  const a = Math.sin(angle) / angle;
  const half = angle / 2;
  const b = 0.5 * (Math.sin(half) / half) ** 2;
  return [
    1 - b * (y * y + z * z), b * x * y - a * z, b * x * z + a * y,
    b * x * y + a * z, 1 - b * (x * x + z * z), b * y * z - a * x,
    b * x * z - a * y, b * y * z + a * x, 1 - b * (x * x + y * y),
  ];
}

// Απαλοιφή Gauss με μερική επιλογή οδηγού στοιχείου, με κλίμακα ανά γραμμή.
// Τα ορίσματα είναι προσωρινοί πίνακες και αλλάζουν επιτόπου.
function solve(matrix, rhs) {
  const size = rhs.length;
  const rowScales = new Array(size);
  for (let i = 0; i < size; i++) {
    let largest = 0;
    for (let j = 0; j < size; j++) {
      largest = Math.max(largest, Math.abs(matrix[i * size + j]));
    }
    if (!(largest > 0) || !Number.isFinite(largest)) return null;
    rowScales[i] = largest;
  }

  for (let col = 0; col < size; col++) {
    let pivot = col;
    let best = 0;
    for (let row = col; row < size; row++) {
      const scaled = Math.abs(matrix[row * size + col]) / rowScales[row];
      if (scaled > best) {
        pivot = row;
        best = scaled;
      }
    }
    if (!(best > Number.EPSILON) || !Number.isFinite(best)) return null;

    const start = col * size;
    if (pivot !== col) {
      for (let j = col; j < size; j++) {
        const index = pivot * size + j;
        [matrix[start + j], matrix[index]] = [matrix[index], matrix[start + j]];
      }
      [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
      [rowScales[col], rowScales[pivot]] = [rowScales[pivot], rowScales[col]];
    }
    for (let row = col + 1; row < size; row++) {
      const offset = row * size;
      const factor = matrix[offset + col] / matrix[start + col];
      for (let j = col + 1; j < size; j++) {
        matrix[offset + j] -= factor * matrix[start + j];
      }
      rhs[row] -= factor * rhs[col];
    }
  }

  for (let i = size - 1; i >= 0; i--) {
    let value = rhs[i];
    for (let j = i + 1; j < size; j++) value -= matrix[i * size + j] * rhs[j];
    rhs[i] = value / matrix[i * size + i];
    if (!Number.isFinite(rhs[i])) return null;
  }
  return rhs;
}

function leastStep(jacobian, residuals, diagonal = 0) {
  const size = jacobian[0].length;
  const normal = new Array(size * size).fill(0);
  const rhs = new Array(size).fill(0);

  for (let k = 0; k < jacobian.length; k++) {
    const row = jacobian[k];
    for (let i = 0; i < size; i++) {
      rhs[i] -= row[i] * residuals[k];
      for (let j = i; j < size; j++) normal[i * size + j] += row[i] * row[j];
    }
  }
  for (let i = 0; i < size; i++) {
    normal[i * size + i] += diagonal;
    for (let j = i + 1; j < size; j++) normal[j * size + i] = normal[i * size + j];
  }
  return solve(normal, rhs);
}

function nearestCardRotation(a, b) {
  const normal = cross(a, b);
  const width = length(a);
  const area = length(normal);
  if (!Number.isFinite(width) || !Number.isFinite(area) || width === 0 || area === 0) return null;

  // Στη βάση (x, y, z), το [a, b, a × b] είναι άνω τριγωνικό.
  // Η πολική διάσπαση αφήνει το z σταθερό και λύνει μια στροφή στο επίπεδο xy.
  const x = scale(a, 1 / width);
  const z = scale(normal, 1 / area);
  const y = cross(z, x);
  const diagonal = width + area / width;
  const offDiagonal = dot(x, b);
  const norm = Math.hypot(diagonal, offDiagonal);
  const cos = diagonal / norm;
  const sin = -offDiagonal / norm;
  const first = add(scale(x, cos), scale(y, sin));
  const second = add(scale(x, -sin), scale(y, cos));
  return [first[0], second[0], z[0], first[1], second[1], z[1], first[2], second[2], z[2]];
}

function positiveCardSize(cardMm) {
  return isPoint2(cardMm) && cardMm[0] > 0 && cardMm[1] > 0;
}

function validCamera(camera) {
  return camera != null && Number.isFinite(camera.focalPx) && camera.focalPx > 0
    && Number.isFinite(camera.cx) && Number.isFinite(camera.cy);
}

function properCornerOrder(corners) {
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    const [cx, cy] = corners[(i + 2) % 4];
    // Η πάνω έδρα φαίνεται με αρνητική φορά στο σύστημα pixel (y προς τα κάτω).
    if (!((bx - ax) * (cy - by) - (by - ay) * (cx - bx) < 0)) return false;
  }
  return true;
}

function initialCardPose(observed, f, [halfWidth, halfHeight]) {
  const matrix = [];
  const rhs = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = UNIT_CORNERS[i];
    const u = observed[i][0] / f;
    const v = observed[i][1] / f;
    matrix.push(x, y, 1, 0, 0, 0, -u * x, -u * y,
      0, 0, 0, x, y, 1, -v * x, -v * y);
    rhs.push(u, v);
  }
  const h = solve(matrix, rhs);
  if (h === null) return null;
  const a = scale([h[0], h[3], h[6]], 1 / halfWidth);
  const b = scale([h[1], h[4], h[7]], 1 / halfHeight);
  const factor = 2 / (length(a) + length(b));
  const rotation = nearestCardRotation(scale(a, factor), scale(b, factor));
  return rotation === null ? null : { rotation, translation: scale([h[2], h[5], 1], factor) };
}

function refineCardPose(local, observed, f, { rotation, translation }) {
  for (let iteration = 0; iteration < 8; iteration++) {
    const jacobian = [];
    const residuals = [];
    for (let i = 0; i < 4; i++) {
      const relative = rotate(rotation, local[i]);
      const [x, y, z] = add(relative, translation);
      if (!Number.isFinite(z) || z === 0) return null;
      const fx = f / z;
      const gradX = [fx, 0, -fx * x / z];
      const gradY = [0, fx, -fx * y / z];
      jacobian.push([...gradX, ...cross(relative, gradX)], [...gradY, ...cross(relative, gradY)]);
      residuals.push(f * (x / z) - observed[i][0], f * (y / z) - observed[i][1]);
    }
    const step = leastStep(jacobian, residuals);
    if (step === null) return null;
    translation = add(translation, step);
    rotation = multiplyMatrices(rotationIncrement(step.slice(3)), rotation);
    if (Math.hypot(...step) < 1e-9) break;
  }
  return { rotation, translation };
}

export function poseFromCard(cornersPx, camera, cardMm = DEFAULT_CARD_MM) {
  if (!validCamera(camera) || !positiveCardSize(cardMm)) {
    return refusal('INVALID_INPUT', 'Η εστιακή, το κύριο σημείο ή οι διαστάσεις της κάρτας είναι άκυρα.');
  }
  if (!Array.isArray(cornersPx) || cornersPx.length !== 4
      || !isPoint2(cornersPx[0]) || !isPoint2(cornersPx[1])
      || !isPoint2(cornersPx[2]) || !isPoint2(cornersPx[3])) {
    return refusal('INVALID_CORNERS', 'Χρειάζονται τέσσερις γωνίες κάρτας με πεπερασμένες συντεταγμένες.');
  }
  if (!properCornerOrder(cornersPx)) {
    return refusal('CORNER_ORDER', 'Οι γωνίες της κάρτας συμπίπτουν ή έχουν λάθος σειρά.');
  }

  const { focalPx: f, cx, cy } = camera;
  const observed = cornersPx.map(([x, y]) => [x - cx, y - cy]);
  const half = cardMm.map(side => side / 2);
  const local = UNIT_CORNERS.map(([x, y]) => [x * half[0], y * half[1], 0]);
  const initial = initialCardPose(observed, f, half);
  const pose = initial === null ? null : refineCardPose(local, observed, f, initial);
  if (pose === null) {
    return refusal('CARD_POSE_FAILED', 'Ο υπολογισμός της θέσης της κάμερας από την κάρτα απέτυχε.');
  }

  const { rotation, translation } = pose;
  const centerMm = rotateTranspose(rotation, scale(translation, -1));
  if (!centerMm.every(Number.isFinite) || !(centerMm[2] > 0)) {
    return refusal('CARD_POSE_FAILED', 'Η θέση της κάμερας πρέπει να βρίσκεται πάνω από την έδρα της κάρτας.');
  }

  let sumSquared = 0;
  for (let i = 0; i < 4; i++) {
    const [x, y, z] = rotate(rotation, subtract(local[i], centerMm));
    if (!(z > 0)) {
      return refusal('CARD_POSE_FAILED', 'Κάποια γωνία της κάρτας δεν βρίσκεται μπροστά από την κάμερα.');
    }
    sumSquared += (f * (x / z) - observed[i][0]) ** 2 + (f * (y / z) - observed[i][1]) ** 2;
  }
  const cardRmsPx = Math.sqrt(sumSquared / 4);
  if (!Number.isFinite(cardRmsPx)) {
    return refusal('CARD_POSE_FAILED', 'Το σφάλμα προβολής της κάρτας δεν μπορεί να υπολογιστεί.');
  }
  const diagonals = [0, 1].map(i => Math.hypot(cornersPx[i][0] - cornersPx[i + 2][0],
    cornersPx[i][1] - cornersPx[i + 2][1]));
  if (cardRmsPx > REFUSAL_LIMITS.maxCardRmsDiagonalFraction * Math.max(...diagonals)) {
    return refusal('CARD_REPROJECTION_HIGH', 'Η κάρτα δεν ταιριάζει στην εικόνα. Ελέγξτε τη σειρά των γωνιών και τις διαστάσεις της.');
  }
  return { ok: true, code: 'OK', message: LABEL, rotation, centerMm, cardRmsPx };
}

function unit(v) {
  return scale(v, 1 / length(v));
}

function worldRay(rotation, [x, y], f) {
  return unit(rotateTranspose(rotation, [x / f, y / f, 1]));
}

function triangulateRays(views, directions) {
  const matrix = new Array(9).fill(0);
  const rhs = [0, 0, 0];
  for (let k = 0; k < views.length; k++) {
    const center = views[k].centerMm;
    const ray = directions[k];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const projection = (i === j ? 1 : 0) - ray[i] * ray[j];
        matrix[3 * i + j] += projection;
        rhs[i] += projection * center[j];
      }
    }
  }
  return solve(matrix, rhs);
}

function mostProminentIndex(pixels) {
  const [x, y] = pixels[0];
  const last = pixels[pixels.length - 1];
  const dx = last[0] - x;
  const dy = last[1] - y;
  let largest = -1;
  let index = 0;
  for (let i = 0; i < pixels.length; i++) {
    const [px, py] = pixels[i];
    const altitude = Math.abs((px - x) * dy - (py - y) * dx);
    if (altitude > largest) {
      largest = altitude;
      index = i;
    }
  }
  return index;
}

function chordFromEndpoints(left, right) {
  if (left === null || right === null) return null;
  const mid = scale(add(left, right), 0.5);
  const chord = subtract(right, left);
  const half = 0.5 * length(chord);
  if (!(half > 1e-8) || !Number.isFinite(half)) return null;
  return { mid, along: scale(chord, 0.5 / half), half };
}

function chordAxes(along) {
  const reference = Math.abs(along[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const axis1 = unit(cross(along, reference));
  return [axis1, cross(along, axis1)];
}

function endpointChord(views) {
  const left = triangulateRays(views, views.map(view => view.rays[0]));
  const right = triangulateRays(views, views.map(view => view.rays[view.rays.length - 1]));
  return chordFromEndpoints(left, right);
}

function initialArc(views, chord) {
  // Το πιο έξω σημείο κάθε όψης δίνει μόνο μια αρχική υπόθεση για το επίπεδο.
  const bulge = triangulateRays(views, views.map(view => view.rays[mostProminentIndex(view.pixels)]));
  if (bulge === null) return null;
  const { mid, along } = chord;
  const relative = subtract(bulge, mid);
  const perpendicular = subtract(relative, scale(along, dot(relative, along)));
  const sag = length(perpendicular);
  if (!(sag > 0) || !Number.isFinite(sag)) return null;
  return { ...chord, up: scale(perpendicular, 1 / sag), sag };
}

function projectedEndTangents(view) {
  const { pixels, focalPx, rotation } = view;
  const [leftX, leftY] = pixels[0];
  const [rightX, rightY] = pixels[pixels.length - 1];
  const halfPx = Math.hypot(rightX - leftX, rightY - leftY) / 2;
  if (!(halfPx > 0)) return null;
  const tx = (rightX - leftX) / (2 * halfPx);
  const ty = (rightY - leftY) / (2 * halfPx);
  const midX = (leftX + rightX) / 2;
  const midY = (leftY + rightY) / 2;
  const points = [];
  let height = 0;
  for (let i = 1; i < pixels.length - 1; i++) {
    const dx = pixels[i][0] - midX;
    const dy = pixels[i][1] - midY;
    const v = -ty * dx + tx * dy;
    points.push([(tx * dx + ty * dy) / halfPx, v]);
    height = Math.max(height, Math.abs(v));
  }
  if (!(height > 64 * Number.EPSILON * Math.max(halfPx, Math.abs(midX), Math.abs(midY)))) return null;

  // Η προβολή του κύκλου περνά από τα δύο άκρα (u = ±1, v = 0).
  // Η εξίσωση είναι u² − 1 + b·u·v + c·v² + d·v = 0.
  const rows = [];
  const residuals = [];
  for (const [u, altitude] of points) {
    const v = altitude / height;
    rows.push([u * v, v ** 2, v]);
    residuals.push(u ** 2 - 1);
  }
  const coefficients = leastStep(rows, residuals);
  if (coefficients === null) return null;
  const [b, , d] = coefficients;
  const weight = Math.sqrt(height / halfPx);
  return [[-1, leftX, leftY], [1, rightX, rightY]].map(([sign, px, py]) => {
    const along = 2 * sign / halfPx;
    const across = (d + sign * b) / height;
    const nx = along * tx - across * ty;
    const ny = along * ty + across * tx;
    const plane = rotateTranspose(rotation, [nx, ny, -(nx * px + ny * py) / focalPx]);
    return scale(unit(plane), weight);
  });
}

function arcFromEndTangents(views, chord) {
  const { along, half } = chord;
  const [axis1, axis2] = chordAxes(along);
  const rows = [];
  const residuals = [];
  for (const view of views) {
    const planes = projectedEndTangents(view);
    if (planes === null) continue;
    // Οι χωρικές εφαπτόμενες είναι παράλληλες στα along ± up·tan(alpha).
    for (const [i, normal] of planes.entries()) {
      rows.push([dot(normal, axis1), dot(normal, axis2)]);
      residuals.push((i === 0 ? 1 : -1) * dot(normal, along));
    }
  }
  if (rows.length < 2) return null;
  const bend = leastStep(rows, residuals);
  if (bend === null) return null;
  const size = Math.hypot(...bend);
  if (!(size > 0) || !Number.isFinite(size)) return null;
  return {
    ...chord,
    up: add(scale(axis1, bend[0] / size), scale(axis2, bend[1] / size)),
    sag: half * (size / (Math.hypot(1, size) + 1)),
  };
}

function polynomial(coefficients, t) {
  let value = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) value = value * t + coefficients[i];
  return value;
}

function bracketedRoot(coefficients, derivative, lo, hi, atLo) {
  let t = (lo + hi) / 2;
  for (let iteration = 0; iteration < 48; iteration++) {
    const value = polynomial(coefficients, t);
    if (value === 0) return t;
    if ((value < 0) === (atLo < 0)) lo = t;
    else hi = t;
    if (hi - lo <= 2e-14) return (lo + hi) / 2;
    const next = t - value / polynomial(derivative, t);
    if (Math.abs(next - t) < 2e-14) return t;
    t = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return t;
}

function polynomialRoots(coefficients) {
  while (coefficients.length > 1 && coefficients[coefficients.length - 1] === 0) coefficients.pop();
  if (coefficients.length < 2) return [];
  if (coefficients.length === 2) {
    const root = -coefficients[0] / coefficients[1];
    return root > -1 && root < 1 ? [root] : [];
  }
  const derivative = coefficients.slice(1).map((value, i) => value * (i + 1));
  const cuts = [-1, ...polynomialRoots(derivative), 1];
  const roots = [];
  let atLo = polynomial(coefficients, -1);
  for (let i = 1; i < cuts.length; i++) {
    const hi = cuts[i];
    const atHi = polynomial(coefficients, hi);
    if ((atLo < 0 && atHi > 0) || (atLo > 0 && atHi < 0)) {
      roots.push(bracketedRoot(coefficients, derivative, cuts[i - 1], hi, atLo));
    }
    if (atHi === 0 && hi < 1) roots.push(hi);
    atLo = atHi;
  }
  return roots;
}

function projectionTangent([a0, a1, a2], [z0, z1, z2]) {
  return [a1 * z0 - a0 * z1, 2 * (a2 * z0 - a0 * z2), a2 * z1 - a1 * z2];
}

function closestParameter({ x, y, z, tx, ty }, [px, py]) {
  // Η παράγωγος της τετραγωνικής απόστασης έχει αριθμητή 4ου βαθμού.
  const a = x[0] - px * z[0];
  const b = x[1] - px * z[1];
  const c = x[2] - px * z[2];
  const d = y[0] - py * z[0];
  const e = y[1] - py * z[1];
  const f = y[2] - py * z[2];
  const [g, h, j] = tx;
  const [k, l, m] = ty;
  const p = [a * g + d * k, a * h + b * g + d * l + e * k,
    a * j + b * h + c * g + d * m + e * l + f * k,
    b * j + c * h + e * m + f * l, c * j + f * m];
  const derivative = [p[1], 2 * p[2], 3 * p[3], 4 * p[4]];
  const left = polynomial(p, -1);
  const right = polynomial(p, 1);
  if (p[1] > Math.abs(derivative[1]) + Math.abs(derivative[2]) + Math.abs(derivative[3])) {
    if (left >= 0) return -1;
    if (right <= 0) return 1;
    return bracketedRoot(p, derivative, -1, 1, left);
  }
  // Μία αλλαγή προσήμου στη βάση Bernstein σημαίνει το πολύ μία ρίζα.
  const nearLeft = left + polynomial(derivative, -1) / 2;
  const nearRight = right - polynomial(derivative, 1) / 2;
  const middle = 2 * nearLeft - left + (2 * p[2] - 6 * p[3] + 12 * p[4]) / 3;
  let changes = 0;
  let previous = 0;
  for (const value of [left, nearLeft, middle, nearRight, right]) {
    const sign = Math.sign(value);
    if (sign === 0) continue;
    if (previous !== 0 && sign !== previous) changes++;
    previous = sign;
  }
  if (changes <= 1) {
    if (left < 0 && right > 0) return bracketedRoot(p, derivative, -1, 1, left);
    if (left > 0 && right > 0) return -1;
    if (left < 0 && right < 0) return 1;
  }

  let best = -1;
  let error = Infinity;
  for (const t of [-1, ...polynomialRoots(p), 1]) {
    const depth = polynomial(z, t);
    const cost = (polynomial(x, t) / depth - px) ** 2 + (polynomial(y, t) / depth - py) ** 2;
    if (cost < error) {
      error = cost;
      best = t;
    }
  }
  return best;
}

function arcFrame(view, arc) {
  const { mid, along, up, half, sag, qSquared } = arc;
  const cameraMid = rotate(view.rotation, subtract(mid, view.centerMm));
  const cameraAlong = rotate(view.rotation, along);
  const cameraUp = rotate(view.rotation, up);
  // Στο t = tan(γωνία / 2) / q, ο αριθμητής της χωρικής θέσης έχει βαθμό 2.
  const coefficients = cameraMid.map((value, i) => [
    value + sag * cameraUp[i], half * (1 + qSquared) * cameraAlong[i],
    qSquared * value - sag * cameraUp[i],
  ]);
  const [x, y] = coefficients.slice(0, 2).map(row => row.map(value => value * view.focalPx));
  const z = coefficients[2];
  const minParameter = z[2] > 0 ? Math.max(-1, Math.min(1, -z[1] / (2 * z[2]))) : -1;
  if (!(Math.min(polynomial(z, minParameter), polynomial(z, 1), polynomial(z, -1)) > 0)) return null;
  const tx = projectionTangent(x, z);
  const ty = projectionTangent(y, z);
  const camera = { x, y, z, tx, ty };
  let cost = 0;
  const samples = view.pixels.map((pixel, i) => {
    let t;
    if (i === 0) t = -1;
    else if (i === view.pixels.length - 1) t = 1;
    else t = closestParameter(camera, pixel);
    const depth = polynomial(z, t);
    const projectedX = polynomial(x, t) / depth;
    const projectedY = polynomial(y, t) / depth;
    const resX = projectedX - pixel[0];
    const resY = projectedY - pixel[1];
    const tangentX = polynomial(tx, t);
    const tangentY = polynomial(ty, t);
    const tangentLength = Math.hypot(tangentX, tangentY);
    // Στο ακραίο σημείο προβολής μιας πλάγιας κάμερας ορίζουμε κάθετο στη χορδή.
    const dx = tangentLength > 0 ? tangentX / tangentLength : 1;
    const dy = tangentLength > 0 ? tangentY / tangentLength : 0;
    const squaredError = resX ** 2 + resY ** 2;
    cost += squaredError;
    return { t, fx: view.focalPx * (1 + qSquared * t ** 2) / depth,
      projectedX: projectedX / view.focalPx, projectedY: projectedY / view.focalPx,
      resX, resY, dx, dy, bound: Math.abs(t) === 1, normalResidual: -dy * resX + dx * resY, squaredError };
  });
  return { view, samples, cost };
}

const ARC_PARAMETERS = 8;

function arcNormalSystem(frames, { along, up, half, sag, q, qSquared }) {
  const normal = new Array(ARC_PARAMETERS ** 2).fill(0);
  const rhs = new Array(ARC_PARAMETERS).fill(0);
  let observations = 0;

  function accumulate(row, residual) {
    observations++;
    for (let i = 0; i < ARC_PARAMETERS; i++) {
      rhs[i] -= row[i] * residual;
      for (let j = i; j < ARC_PARAMETERS; j++) normal[i * ARC_PARAMETERS + j] += row[i] * row[j];
    }
  }

  for (const frame of frames) {
    for (const sample of frame.samples) {
      const { t, bound, dx, dy, resX, resY } = sample;
      const denominator = 1 + qSquared * t ** 2;
      const x = half * (1 + qSquared) * t / denominator;
      const y = sag * (1 - t ** 2) / denominator;
      const offset = add(scale(along, x), scale(up, y));
      const { fx, projectedX, projectedY } = sample;
      const basis = (1 - t ** 2) / denominator;
      const correction = 2 * qSquared * t ** 2 / denominator;
      const dXHalf = x / half - 2 * qSquared * t * basis / denominator;
      const dYHalf = correction * y / half;
      const dXSag = 2 * q * t * basis / denominator;
      const dYSag = (1 - correction) * basis;
      const row = (dirX, dirY) => {
        const gradient = [fx * dirX, fx * dirY, -fx * (dirX * projectedX + dirY * projectedY)];
        const k = rotateTranspose(frame.view.rotation, gradient);
        const a = dot(k, along);
        const u = dot(k, up);
        return [...k, ...cross(offset, k), a * dXHalf + u * dYHalf, a * dXSag + u * dYSag];
      };
      // Οι δεσμευμένες γωνίες κρατούν και την εφαπτομενική συνιστώσα.
      if (bound) {
        accumulate(row(1, 0), resX);
        accumulate(row(0, 1), resY);
      } else {
        accumulate(row(-dy, dx), sample.normalResidual);
      }
    }
  }
  const scales = rhs.map((_, i) => Math.sqrt(normal[i * ARC_PARAMETERS + i]));
  if (!scales.every(value => value > 0 && Number.isFinite(value))) return null;
  for (let i = 0; i < ARC_PARAMETERS; i++) {
    for (let j = i; j < ARC_PARAMETERS; j++) {
      const value = normal[i * ARC_PARAMETERS + j] / (scales[i] * scales[j]);
      normal[i * ARC_PARAMETERS + j] = value;
      normal[j * ARC_PARAMETERS + i] = value;
    }
  }
  return { normal, rhs, scales, observations };
}

function solveArcSystem(system, damping = 0, target = system.rhs) {
  const { normal, scales } = system;
  const matrix = normal.slice();
  for (let i = 0; i < ARC_PARAMETERS; i++) matrix[i * ARC_PARAMETERS + i] += damping;
  const result = solve(matrix, target.map((value, i) => value / scales[i]));
  return result === null ? null : result.map((value, i) => value / scales[i]);
}

function applyArcStep(arc, step) {
  const angular = step.slice(3, 6);
  const factor = Math.max(1, length(angular) / 0.4, Math.abs(step[6]) / (0.5 * arc.half),
    Math.abs(step[7]) / (0.5 * arc.sag));
  const increment = rotationIncrement(scale(angular, 1 / factor));
  return {
    mid: add(arc.mid, scale(step, 1 / factor)),
    along: rotate(increment, arc.along),
    up: rotate(increment, arc.up),
    half: arc.half + step[6] / factor,
    sag: arc.sag + step[7] / factor,
  };
}

function repeatedView(views) {
  // Ανοχή στρογγυλοποίησης για ίδιες θέσεις, ανεξάρτητη από το όριο προειδοποίησης.
  const tolerance = 64 * Number.EPSILON;
  let distinctCenters = false;
  for (let i = 0; i < views.length; i++) {
    const a = views[i];
    for (let j = 0; j < i; j++) {
      const b = views[j];
      const distance = length(subtract(a.centerMm, b.centerMm));
      if (distance > tolerance * Math.max(1, length(a.centerMm), length(b.centerMm))) {
        distinctCenters = true;
      } else if (a.rotation.every((value, k) => Math.abs(value - b.rotation[k]) <= tolerance)) {
        return true;
      }
    }
  }
  return !distinctCenters;
}

function hasCurvedProjection({ pixels }) {
  const [x, y] = pixels[0];
  const last = pixels[pixels.length - 1];
  const dx = last[0] - x;
  const dy = last[1] - y;
  const chord = Math.hypot(dx, dy);
  if (chord === 0) return pixels.some(([px, py]) => px !== x || py !== y);

  const tx = dx / chord;
  const ty = dy / chord;
  return pixels.some(([px, py]) => {
    const distance = Math.abs(-ty * (px - x) + tx * (py - y));
    const rounding = 32 * Number.EPSILON * Math.max(chord, Math.abs(x), Math.abs(y), Math.abs(px), Math.abs(py));
    return distance > rounding;
  });
}

const MAX_ARC_ITERATIONS = 100;
const EXACT_EDGE_RMS_PX = 1e-9;
const EXACT_RADIUS_TOLERANCE_MM = 1e-6;
const AMBIGUITY_COST_FRACTION = 0.02;
const AMBIGUITY_RADIUS_FRACTION = 0.01;
const MIRROR_SAGITTA_SIGNAL = 12;

function evaluateArc(views, state) {
  const { half, sag } = state;
  const q = sag / half;
  const qSquared = q ** 2;
  const radius = (half ** 2 + sag ** 2) / (2 * sag);
  if (!(q > 0) || !Number.isFinite(radius)) return null;
  const arc = { ...state, q, qSquared, radius, alpha: 2 * Math.atan(q) };
  const frames = [];
  let cost = 0;
  let count = 0;
  for (const view of views) {
    const frame = arcFrame(view, arc);
    if (frame === null) return null;
    frames.push(frame);
    cost += frame.cost;
    count += frame.samples.length;
  }
  return Number.isFinite(cost) ? { arc, frames, cost, count } : null;
}

function relativeArcStep({ half, sag }, step) {
  return Math.max(Math.hypot(step[0], step[1], step[2]) / half,
    Math.hypot(step[3], step[4], step[5]), Math.abs(step[6]) / half, Math.abs(step[7]) / sag);
}

function residualAtRoundoff(fit) {
  return fit.cost <= fit.count * EXACT_EDGE_RMS_PX ** 2;
}

function fitFromStart(views, start) {
  let fit = evaluateArc(views, start);
  if (fit === null) return null;
  let system = null;
  let damping = 1e-6;
  let rejected = 0;

  for (let i = 0; i < MAX_ARC_ITERATIONS; i++) {
    if (system === null) system = arcNormalSystem(fit.frames, fit.arc);
    if (system === null) return null;
    // Η σύγκλιση ελέγχεται με το βήμα χωρίς απόσβεση.
    const fullStep = solveArcSystem(system);
    if (fullStep !== null) {
      const size = relativeArcStep(fit.arc, fullStep);
      const predicted = fullStep.reduce((sum, value, j) => sum + value * system.rhs[j], 0);
      const precision = fit.cost + fit.count * EXACT_EDGE_RMS_PX ** 2;
      const smallStep = residualAtRoundoff(fit) ? 3e-9 : 2e-7;
      if (size < 3e-11 || (rejected >= 3 && size < smallStep && predicted < 2e-12 * precision)) {
        const excess = fit.arc.sag - fit.arc.half;
        // Διορθώνουμε μόνο υπέρβαση του ημικυκλίου από στρογγυλοποίηση.
        if (excess <= 0 || excess > 2e-10 * fit.arc.half) return { ...fit, system };
        const semicircle = evaluateArc(views, { ...fit.arc, sag: fit.arc.half });
        const semicircleSystem = semicircle === null ? null : arcNormalSystem(semicircle.frames, semicircle.arc);
        return semicircleSystem === null ? null : { ...semicircle, system: semicircleSystem };
      }
    }

    const step = solveArcSystem(system, damping);
    const trial = step === null ? null : evaluateArc(views, applyArcStep(fit.arc, step));
    if (trial !== null && trial.cost < fit.cost) {
      fit = trial;
      system = null;
      damping = Math.max(1e-12, damping / 4);
      rejected = 0;
    } else {
      damping *= 8;
      rejected++;
      if (damping > 1e12) return null;
    }
  }
  return null;
}

function arcUncertainty({ arc, cost, system }) {
  const variance = cost / (system.observations - ARC_PARAMETERS);
  const ratio = arc.half / arc.sag;
  const radiusGradient = [0, 0, 0, 0, 0, 0, ratio, (1 - ratio ** 2) / 2];
  const sagGradient = [0, 0, 0, 0, 0, 0, 0, 1];
  const radiusColumn = solveArcSystem(system, 0, radiusGradient);
  const sagColumn = solveArcSystem(system, 0, sagGradient);
  if (radiusColumn === null || sagColumn === null) return null;
  const radiusVariance = variance * (radiusGradient[6] * radiusColumn[6] + radiusGradient[7] * radiusColumn[7]);
  const sagVariance = variance * sagColumn[7];
  const radiusSigmaMm = Math.sqrt(radiusVariance);
  const sagittaSigmaMm = Math.sqrt(sagVariance);
  return Number.isFinite(radiusSigmaMm) && Number.isFinite(sagittaSigmaMm)
    ? { radiusSigmaMm, sagittaSigmaMm } : null;
}

function sameArc(a, b) {
  const tolerance = 1e-4;
  return Math.abs(a.half / b.half - 1) < tolerance && Math.abs(a.sag / b.sag - 1) < tolerance
    && length(subtract(a.mid, b.mid)) < tolerance * b.half
    && length(subtract(a.along, b.along)) < tolerance && length(subtract(a.up, b.up)) < tolerance;
}

function fitArc(views) {
  if (repeatedView(views)) {
    return refusal('DUPLICATE_VIEW', 'Η ίδια θέση και κατεύθυνση κάμερας επαναλαμβάνονται ή όλες οι θέσεις συμπίπτουν.');
  }
  if (!views.some(hasCurvedProjection)) {
    return refusal('STRAIGHT_EDGE', 'Τα σημεία της άκρης είναι σε ευθεία σε όλες τις όψεις.');
  }
  const chord = endpointChord(views);
  const tangentStart = chord === null ? null : arcFromEndTangents(views, chord);
  const bulgeStart = chord === null ? null : initialArc(views, chord);
  if (tangentStart === null && bulgeStart === null) {
    return refusal('ARC_INITIAL_FAILED', 'Δεν βρέθηκαν στον χώρο διακριτά άκρα και σημείο έξω από τη χορδή.');
  }

  const candidates = [];
  let beyondSemicircle = false;
  function tryStart(start) {
    if (start === null) return;
    const fit = fitFromStart(views, start);
    if (fit === null) return;
    if (fit.arc.sag > fit.arc.half) beyondSemicircle = true;
    else candidates.push(fit);
  }
  tryStart(tangentStart);
  tryStart(bulgeStart);
  const [first, second] = candidates;
  const exact = candidates.some(residualAtRoundoff);
  // Ξαναδοκιμάζουμε το κατοπτρικό τόξο όταν οι δύο αφετηρίες διαφωνούν ή η καμπυλότητα έχει αδύναμο σήμα.
  const confirmed = views.length >= 3 && second !== undefined && sameArc(first.arc, second.arc)
    && first.arc.sag >= MIRROR_SAGITTA_SIGNAL * (arcUncertainty(first)?.sagittaSigmaMm ?? Infinity);
  if ((!exact && !confirmed) || (exact && (tangentStart === null || bulgeStart === null))) {
    const mirror = bulgeStart ?? tangentStart;
    tryStart({ ...mirror, up: scale(mirror.up, -1) });
  }
  if (candidates.length === 0) {
    if (beyondSemicircle) {
      return refusal('ARC_FIT_FAILED', 'Η προσαρμογή που συγκλίνει ζητά βέλος μεγαλύτερο από τη μισή χορδή.');
    }
    return refusal('ARC_FIT_FAILED', 'Καμία αφετηρία δεν έδωσε έγκυρη προσαρμογή τόξου μέσα στο όριο επαναλήψεων.');
  }

  candidates.sort((a, b) => a.cost - b.cost);
  const [best, ...others] = candidates;
  if (residualAtRoundoff(best) && others.some(fit => residualAtRoundoff(fit)
      && Math.abs(fit.arc.radius - best.arc.radius) > EXACT_RADIUS_TOLERANCE_MM)) {
    return refusal('ARC_AMBIGUOUS', 'Οι ίδιες όψεις δίνουν διαφορετικές ακτίνες με υπόλοιπα στο επίπεδο της στρογγυλοποίησης.');
  }
  const alternative = others.find(fit => fit.cost <= best.cost * (1 + AMBIGUITY_COST_FRACTION)
    && Math.abs(fit.arc.radius / best.arc.radius - 1) > AMBIGUITY_RADIUS_FRACTION);
  const uncertainty = arcUncertainty(best);
  if (uncertainty === null) {
    return refusal('ARC_UNCERTAINTY_FAILED', 'Δεν μπορεί να υπολογιστεί η αβεβαιότητα της ακτίνας και του βέλους.');
  }
  if (best.arc.sag < REFUSAL_LIMITS.minSagittaSigmaRatio * uncertainty.sagittaSigmaMm) {
    return refusal('STRAIGHT_EDGE', 'Η καμπυλότητα της άκρης δεν ξεχωρίζει από τον θόρυβο. Το βέλος είναι μικρότερο από τρεις φορές το τυπικό σφάλμα του.');
  }
  return { ok: true, ...best, ...uncertainty, alternativeRadiusMm: alternative?.arc.radius ?? null };
}

function fitBow(phase, residualsPx) {
  const basis = phase.slice(1, -1).map(value => [Math.cos(Math.PI * value), Math.sin(Math.PI * value)]);
  let cc = 0;
  let ss = 0;
  let cs = 0;
  let cr = 0;
  let sr = 0;
  let residualSum = 0;
  for (let i = 0; i < basis.length; i++) {
    const [cos, sin] = basis[i];
    const residual = residualsPx[i + 1];
    cc += cos * cos;
    ss += sin * sin;
    cs += cos * sin;
    cr += cos * residual;
    sr += sin * residual;
    residualSum += residual;
  }

  let cosPx;
  let sinPx;
  const determinant = cc * ss - cs * cs;
  if (determinant > Number.EPSILON * (cc + ss) ** 2) {
    cosPx = (ss * cr - cs * sr) / determinant;
    sinPx = (cc * sr - cs * cr) / determinant;
  } else {
    // Με μία διακριτή κατεύθυνση στη βάση, κρατάμε τη λύση ελάχιστου μέτρου.
    const angle = 0.5 * Math.atan2(2 * cs, cc - ss);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const strength = (cos * cr + sin * sr) / (cc * cos ** 2 + 2 * cs * cos * sin + ss * sin ** 2);
    cosPx = cos * strength;
    sinPx = sin * strength;
  }

  let squared = 0;
  for (const [cos, sin] of basis) squared += (cos * cosPx + sin * sinPx) ** 2;
  return { cosPx, sinPx, rmsPx: Math.sqrt(squared / basis.length), meanPx: residualSum / basis.length };
}

function diagnoseView({ view, samples }, { q, alpha }, edgeRmsPx) {
  const { rotation, centerMm, cardRmsPx } = view;
  const residualsPx = samples.map(sample => sample.normalResidual);
  const phase = samples.map(sample => 2 * Math.atan(q * sample.t) / alpha);
  const endMissPx = [samples[0], samples[samples.length - 1]].map(sample => Math.hypot(sample.resX, sample.resY));
  return { rotation, centerMm, cardRmsPx, edgeRmsPx, residualsPx, phase, endMissPx,
    bow: fitBow(phase, residualsPx) };
}

function viewSpread(views, mid) {
  const directions = views.map(view => unit(subtract(view.centerMm, mid)));
  let largest = 0;
  for (let i = 0; i < directions.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = directions[i];
      const b = directions[j];
      largest = Math.max(largest, Math.atan2(length(cross(a, b)), dot(a, b)));
    }
  }
  return largest * 180 / Math.PI;
}

function refitFromFullArc(views, arc) {
  if (repeatedView(views) || !views.some(hasCurvedProjection)) return null;
  const fit = fitFromStart(views, arc);
  if (fit === null || fit.arc.sag > fit.arc.half) return null;
  const uncertainty = arcUncertainty(fit);
  return uncertainty !== null
    && fit.arc.sag >= REFUSAL_LIMITS.minSagittaSigmaRatio * uncertainty.sagittaSigmaMm ? fit : null;
}

function omissionStatistic(fullCost, subsetCost, degrees, pointsOmitted) {
  if (degrees <= 0) return null;
  const variance = Math.max(subsetCost / degrees, EXACT_EDGE_RMS_PX ** 2);
  const statistic = (Math.max(0, fullCost - subsetCost) / pointsOmitted) / variance;
  return Number.isFinite(statistic) ? statistic : null;
}

function endpointPairCostFloor(a, b, baseline, last) {
  const [ax, ay] = a.pixels[last ? a.pixels.length - 1 : 0];
  const [bx, by] = b.pixels[last ? b.pixels.length - 1 : 0];
  const rayA = rotateTranspose(a.rotation, [ax / a.focalPx, ay / a.focalPx, 1]);
  const rayB = rotateTranspose(b.rotation, [bx / b.focalPx, by / b.focalPx, 1]);
  const error = Math.abs(dot(baseline, cross(rayA, rayB)));
  if (error === 0) return 0;
  const [dAx, dAy] = rotate(a.rotation, cross(rayB, baseline));
  const [dBx, dBy] = rotate(b.rotation, cross(baseline, rayA));
  const gradient = Math.hypot(dAx / a.focalPx, dAy / a.focalPx, dBx / b.focalPx, dBy / b.focalPx);
  // Για κοινό άκρο οι ακτίνες και η βάση είναι ομοεπίπεδες.
  // Αν d είναι το μέτρο της διόρθωσης σε pixel, error ≤ gradient·d + quadratic·d².
  const quadratic = 0.5 / a.focalPx / b.focalPx;
  const distance = 2 * error / (gradient + Math.hypot(gradient, 2 * Math.sqrt(quadratic * error)));
  const squared = distance ** 2;
  return Number.isFinite(squared) ? squared : 0;
}

function endpointCostFloor(views) {
  let first = 0;
  let last = 0;
  for (let i = 0; i < views.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = views[i], b = views[j];
      const delta = subtract(b.centerMm, a.centerMm);
      const lengthMm = length(delta);
      if (!(lengthMm > 0 && Number.isFinite(lengthMm))) continue;
      const baseline = scale(delta, 1 / lengthMm);
      first = Math.max(first, endpointPairCostFloor(a, b, baseline, false));
      last = Math.max(last, endpointPairCostFloor(a, b, baseline, true));
    }
  }
  return first + last;
}

function identifySuspect(check, missingFitUpperBound) {
  const ranked = check.statistic.map((value, i) => ({ value, view: i + 1 }))
    .filter(candidate => candidate.value !== null)
    .sort((a, b) => b.value - a.value);
  const [first, second] = ranked;
  if (first === undefined) {
    check.reason = 'INCOMPLETE_FITS';
    return;
  }
  const secondValue = second?.value ?? 0;
  const rival = Math.max(secondValue, missingFitUpperBound);
  check.separation = Math.min(Number.MAX_VALUE, first.value / Math.max(rival, Number.EPSILON));
  if (first.value <= check.limit) {
    check.reason = missingFitUpperBound > check.limit ? 'INCOMPLETE_FITS' : 'BELOW_LIMIT';
  } else if (check.separation <= check.separationLimit) {
    check.reason = missingFitUpperBound > secondValue ? 'INCOMPLETE_FITS' : 'NOT_SEPARATED';
  } else {
    check.reason = 'SUSPECT';
    check.suspectView = first.view;
  }
}

function checkViewOmissions(views, full, includeLeaveOneOut, includeViewCheck) {
  const viewCheck = includeViewCheck ? {
    method: 'leave-one-out', suspectView: null, reason: 'TOO_FEW_VIEWS',
    statistic: Array(views.length).fill(null), limit: WARNING_LIMITS.viewCheckStatistic,
    separation: null, separationLimit: WARNING_LIMITS.viewCheckSeparation,
  } : null;
  if (views.length < 3 || (!includeLeaveOneOut && !includeViewCheck)) {
    return { viewCheck, leaveOneOut: null };
  }

  let maxChangePct = null;
  let missingFitUpperBound = 0;
  const radiiMm = views.map((view, omitted) => {
    const remaining = views.filter((_, i) => i !== omitted);
    const warmFit = viewCheck === null ? null : refitFromFullArc(remaining, full.arc);
    // Η ακτίνα χωρίς την όψη κρατά τις αφετηρίες του 0.1.1.
    const oldFit = includeLeaveOneOut || warmFit === null ? fitArc(remaining) : null;
    if (viewCheck !== null) {
      const fit = warmFit ?? (oldFit?.ok ? oldFit : null);
      const points = view.pixels.length;
      const statistic = fit === null ? null
        : omissionStatistic(full.cost, fit.cost, fit.system.observations - ARC_PARAMETERS, points);
      viewCheck.statistic[omitted] = statistic;
      if (statistic === null) {
        // Κάθε σημείο συνεισφέρει έως δύο συνιστώσες στο σύστημα.
        const maxDegrees = 2 * (full.count - points) - ARC_PARAMETERS;
        const bound = omissionStatistic(full.cost, endpointCostFloor(remaining), maxDegrees, points);
        missingFitUpperBound = Math.max(missingFitUpperBound, bound ?? Number.MAX_VALUE);
      }
    }
    if (!includeLeaveOneOut || !oldFit?.ok) return null;
    maxChangePct = Math.max(maxChangePct ?? 0, 100 * Math.abs(oldFit.arc.radius / full.arc.radius - 1));
    return oldFit.arc.radius;
  });
  if (viewCheck !== null) identifySuspect(viewCheck, missingFitUpperBound);
  return { viewCheck, leaveOneOut: includeLeaveOneOut ? { radiiMm, maxChangePct } : null };
}

function refineScanEndpoint(views, last) {
  let point = triangulateRays(views, views.map(view => view.rays[last ? view.rays.length - 1 : 0]));
  if (point === null) return null;
  const epsilon = 1e-6;
  for (let iteration = 0; iteration < 3; iteration++) {
    const displaced = point.map((_, axis) => point.map((value, i) => value + (i === axis ? epsilon : 0)));
    const jacobian = [];
    const residuals = [];
    for (const view of views) {
      const [x, y, z] = rotate(view.rotation, subtract(point, view.centerMm));
      const u = x / z;
      const v = y / z;
      const observed = view.pixels[last ? view.pixels.length - 1 : 0];
      residuals.push(u - observed[0] / view.focalPx, v - observed[1] / view.focalPx);
      const rowX = [];
      const rowY = [];
      for (const shifted of displaced) {
        const [a, b, c] = rotate(view.rotation, subtract(shifted, view.centerMm));
        rowX.push((a / c - u) / epsilon);
        rowY.push((b / c - v) / epsilon);
      }
      jacobian.push(rowX, rowY);
    }
    const step = leastStep(jacobian, residuals, 1e-14);
    if (step === null) return null;
    point = add(point, step);
  }
  return views.every(view => rotate(view.rotation, subtract(point, view.centerMm))[2] > 0) ? point : null;
}

function fitScanCircle(u, v, halfSquared) {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < u.length; i++) {
    numerator += v[i] * (u[i] ** 2 + v[i] ** 2 - halfSquared);
    denominator += v[i] ** 2;
  }
  if (!(denominator > 0)) return null;
  let offset = numerator / (2 * denominator);
  for (let iteration = 0; iteration < 3; iteration++) {
    const radius = Math.sqrt(halfSquared + offset ** 2);
    let correction = 0;
    let curvature = 0;
    for (let i = 0; i < u.length; i++) {
      const radial = Math.sqrt(u[i] ** 2 + (v[i] - offset) ** 2);
      if (!(radial > 0)) return null;
      // Ισοδύναμο με radial − radius, και σταθερό για πολύ ρηχό τόξο.
      const error = (u[i] ** 2 + v[i] ** 2 - halfSquared - 2 * v[i] * offset) / (radial + radius);
      const derivative = (-v[i] - offset * error / radius) / radial;
      correction += error * derivative;
      curvature += derivative ** 2;
    }
    if (!(curvature > 0)) return null;
    offset -= correction / curvature;
  }
  const radius = Math.sqrt(halfSquared + offset ** 2);
  return Number.isFinite(radius) ? { offset, radius } : null;
}

function sweepCost(angle, { halfSquared, frames, u, v }) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let i = 0;
  for (const frame of frames) {
    const [offsetAlong, offset1, offset2] = frame.offset;
    const height = -(cos * offset1 + sin * offset2);
    const vertical = sin * offset1 - cos * offset2;
    for (const sample of frame.samples) {
      const projection = cos * sample.axis1 + sin * sample.axis2;
      const distance = height / projection;
      if (Math.abs(projection) <= 64 * Number.EPSILON || !(distance > 0) || !Number.isFinite(distance)) return null;
      u[i] = offsetAlong + sample.along * distance;
      v[i] = vertical + (sin * sample.axis1 - cos * sample.axis2) * distance;
      i++;
    }
  }
  const circle = fitScanCircle(u, v, halfSquared);
  if (circle === null) return null;

  const { offset, radius } = circle;
  let cost = 0;
  i = 0;
  for (const frame of frames) {
    const [mx, my, mz] = frame.cameraMid;
    const [ax, ay, az] = frame.cameraAlong;
    const [vx, vy, vz] = subtract(scale(frame.cameraAxis1, sin), scale(frame.cameraAxis2, cos));
    for (const sample of frame.samples) {
      const delta = v[i] - offset;
      const radial = Math.sqrt(u[i] ** 2 + delta ** 2);
      if (!(radial > 0)) return null;
      const correction = (halfSquared - u[i] ** 2 - v[i] ** 2 + 2 * v[i] * offset)
        / (radial * (radial + radius));
      const onAlong = u[i] * (1 + correction);
      const onVertical = v[i] + delta * correction;
      const z = mz + az * onAlong + vz * onVertical;
      if (!(z > 0)) return null;
      const x = mx + ax * onAlong + vx * onVertical;
      const y = my + ay * onAlong + vy * onVertical;
      cost += (x / z - sample.x) ** 2 + (y / z - sample.y) ** 2;
      i++;
    }
  }
  return Number.isFinite(cost) ? { angle, cost, radius } : null;
}

function canonicalPlaneAngle(angle) {
  return angle - Math.PI * Math.floor((angle + Math.PI / 2) / Math.PI);
}

function refineScanMinimum(geometry, lo, hi, best) {
  const ratio = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - ratio * (hi - lo);
  let x2 = lo + ratio * (hi - lo);
  let first = sweepCost(x1, geometry);
  let second = sweepCost(x2, geometry);
  for (let i = 0; i < 54 && hi - lo > 1e-13; i++) {
    if (first !== null && first.cost < best.cost) best = first;
    if (second !== null && second.cost < best.cost) best = second;
    if ((first?.cost ?? Infinity) <= (second?.cost ?? Infinity)) {
      hi = x2;
      x2 = x1;
      second = first;
      x1 = hi - ratio * (hi - lo);
      first = sweepCost(x1, geometry);
    } else {
      lo = x1;
      x1 = x2;
      first = second;
      x2 = lo + ratio * (hi - lo);
      second = sweepCost(x2, geometry);
    }
  }
  return best;
}

function scanMinima(views, chord, geometry, axis1, axis2) {
  const degree = Math.PI / 180;
  const angles = Array.from({ length: 180 }, (_, i) => (i - 90) * degree);
  for (const { offset: [, offset1, offset2] } of geometry.frames) {
    const grazingAngle = Math.atan2(-offset1, offset2);
    for (const delta of [-0.25, -0.03, -0.003, 0, 0.003, 0.03, 0.25]) {
      angles.push(canonicalPlaneAngle(grazingAngle + delta * degree));
    }
  }
  const tangents = arcFromEndTangents(views, chord);
  if (tangents !== null) {
    const normal = cross(chord.along, tangents.up);
    angles.push(canonicalPlaneAngle(Math.atan2(dot(normal, axis2), dot(normal, axis1))));
  }

  angles.sort((a, b) => a - b);
  const grid = angles.filter((angle, i) => i === 0 || angle - angles[i - 1] > 1e-13);
  const costs = grid.map(angle => sweepCost(angle, geometry));
  const minima = [];
  const last = grid.length - 1;
  for (const [i, fit] of costs.entries()) {
    if (fit === null) continue;
    const previous = i === 0 ? last : i - 1;
    const next = i === last ? 0 : i + 1;
    const left = costs[previous]?.cost ?? Infinity;
    const right = costs[next]?.cost ?? Infinity;
    if (fit.cost > left || fit.cost > right || (fit.cost === left && fit.cost === right)) continue;
    const lo = grid[previous] - (i === 0 ? Math.PI : 0);
    const hi = grid[next] + (i === last ? Math.PI : 0);
    minima.push(refineScanMinimum(geometry, lo, hi, fit));
  }
  return minima.sort((a, b) => a.cost - b.cost);
}

function scanRefusal(code, message) {
  return { ...refusal(code, message), radiusMm: null, chordMm: null, planeAngleRad: null };
}

function scanWithPose(views) {
  const chord = chordFromEndpoints(refineScanEndpoint(views, false), refineScanEndpoint(views, true));
  if (chord === null) return scanRefusal('SCAN_CHORD_FAILED', 'Η σάρωση δεν μπόρεσε να βρει τη χορδή.');
  const { mid, along, half } = chord;
  const [axis1, axis2] = chordAxes(along);
  let count = 0;
  const frames = views.map(view => {
    const fromCamera = subtract(mid, view.centerMm);
    const rotation = view.rotation;
    const samples = view.pixels.slice(1, -1).map(([x, y], i) => {
      const ray = view.rays[i + 1];
      return { x: x / view.focalPx, y: y / view.focalPx, along: dot(ray, along),
        axis1: dot(ray, axis1), axis2: dot(ray, axis2) };
    });
    count += samples.length;
    return { offset: [-dot(fromCamera, along), -dot(fromCamera, axis1), -dot(fromCamera, axis2)],
      cameraMid: rotate(rotation, fromCamera), cameraAlong: rotate(rotation, along),
      cameraAxis1: rotate(rotation, axis1), cameraAxis2: rotate(rotation, axis2), samples };
  });
  const geometry = { halfSquared: half ** 2, frames, u: new Float64Array(count), v: new Float64Array(count) };
  const [best, ...others] = scanMinima(views, chord, geometry, axis1, axis2);
  if (best === undefined) {
    return scanRefusal('SCAN_MINIMUM_FAILED', 'Η σάρωση δεν βρήκε ελάχιστο με έγκυρες προβολές σε όλες τις όψεις.');
  }
  if (others.some(fit => fit.cost <= best.cost * (1 + AMBIGUITY_COST_FRACTION)
      && Math.abs(fit.radius / best.radius - 1) > AMBIGUITY_RADIUS_FRACTION)) {
    return scanRefusal('SCAN_AMBIGUOUS', 'Η σάρωση βρήκε διαφορετικές ακτίνες με παρόμοιο σφάλμα.');
  }
  return { ok: true, radiusMm: best.radius, chordMm: 2 * half, planeAngleRad: canonicalPlaneAngle(best.angle) };
}

function prepareViews(views, cardMm) {
  const prepared = [];
  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    if (view == null) return refusal('INVALID_INPUT', `Λείπει η όψη ${i + 1}.`);
    const pose = poseFromCard(view.cornersPx, view, cardMm);
    if (!pose.ok) return { ...pose, message: `${pose.message} Όψη ${i + 1}.` };
    if (!Array.isArray(view.edgePx) || view.edgePx.length < 5) {
      return refusal('INVALID_EDGE', `Η όψη ${i + 1} χρειάζεται τουλάχιστον πέντε σημεία άκρης.`);
    }
    const pixels = [];
    for (const point of view.edgePx) {
      if (!isPoint2(point)) {
        return refusal('INVALID_EDGE', `Η όψη ${i + 1} έχει άκυρη συντεταγμένη άκρης.`);
      }
      pixels.push([point[0] - view.cx, point[1] - view.cy]);
    }
    const rays = pixels.map(pixel => worldRay(pose.rotation, pixel, view.focalPx));
    if (rays.some(ray => !ray.every(Number.isFinite))) {
      return refusal('INVALID_EDGE', `Οι συντεταγμένες άκρης της όψης ${i + 1} δεν δίνουν έγκυρες ακτίνες.`);
    }
    const { rotation, centerMm, cardRmsPx } = pose;
    prepared.push({ rotation, centerMm, cardRmsPx, focalPx: view.focalPx, pixels, rays });
  }
  return { ok: true, views: prepared };
}

function median(values) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function measurementWarnings({ viewSpreadDeg, disagreementPct, leaveOneOut, diagnostics, scan,
  radiusMm, alternativeRadiusMm, viewCheck }) {
  const limits = WARNING_LIMITS;
  const details = [];
  const addWarning = (code, view, value, limit) => details.push({ code, view, value, limit });

  if (viewSpreadDeg < limits.minViewSpreadDeg) {
    addWarning('LOW_VIEW_SPREAD', null, viewSpreadDeg, limits.minViewSpreadDeg);
  }
  if (disagreementPct !== null && disagreementPct > limits.maxDisagreementPct) {
    addWarning('ESTIMATOR_DISAGREEMENT', null, disagreementPct, limits.maxDisagreementPct);
  }
  if (leaveOneOut?.maxChangePct > limits.maxLeaveOneOutChangePct) {
    addWarning('LEAVE_ONE_OUT_CHANGE', null, leaveOneOut.maxChangePct, limits.maxLeaveOneOutChangePct);
  }
  leaveOneOut?.radiiMm.forEach((radius, i) => {
    if (radius === null) addWarning('LEAVE_ONE_OUT_FAILED', i + 1, false, true);
  });
  for (const [i, view] of diagnostics.entries()) {
    if (view.bow.rmsPx > limits.maxBowRmsPx) addWarning('VIEW_BOW_HIGH', i + 1, view.bow.rmsPx, limits.maxBowRmsPx);
  }
  for (const [i, view] of diagnostics.entries()) {
    if (view.cardRmsPx > limits.maxCardRmsPx) addWarning('CARD_RMS_HIGH', i + 1, view.cardRmsPx, limits.maxCardRmsPx);
  }
  if (scan !== null && scan.ok !== limits.expectedScanOk) {
    addWarning('SCAN_FAILED', null, scan.ok, limits.expectedScanOk);
  }
  if (alternativeRadiusMm !== null) {
    addWarning('ARC_AMBIGUOUS', null, 100 * Math.abs(alternativeRadiusMm / radiusMm - 1),
      100 * AMBIGUITY_RADIUS_FRACTION);
  }
  for (const [i, view] of diagnostics.entries()) {
    // Με δύο όψεις δεν υπάρχει πλειοψηφία που να δείχνει ποια αποκλίνει.
    if (diagnostics.length >= 3) {
      const others = diagnostics.filter((_, j) => j !== i).map(other => other.edgeRmsPx);
      const limit = Math.max(EXACT_EDGE_RMS_PX, limits.maxViewEdgeRmsRatio * median(others));
      if (view.edgeRmsPx > limit) addWarning('VIEW_EDGE_RMS_HIGH', i + 1, view.edgeRmsPx, limit);
    }
    const endMiss = Math.max(...view.endMissPx);
    if (endMiss > limits.maxEndMissPx) addWarning('VIEW_END_MISS_HIGH', i + 1, endMiss, limits.maxEndMissPx);
  }
  if (viewCheck !== null && viewCheck.suspectView !== null) {
    const view = viewCheck.suspectView;
    addWarning('VIEW_SUSPECT', view, viewCheck.statistic[view - 1], viewCheck.limit);
  }

  return { warnings: [...new Set(details.map(detail => detail.code))], warningDetails: details };
}

export function measureArc(views, options = {}) {
  if (!Array.isArray(views) || views.length < 2) {
    return refusal('TOO_FEW_VIEWS', 'Χρειάζονται τουλάχιστον δύο όψεις.');
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    return refusal('INVALID_INPUT', 'Οι επιλογές μέτρησης είναι άκυρες.');
  }
  const { cardMm = DEFAULT_CARD_MM, scan: includeScan = true, leaveOneOut: includeLeaveOneOut = true } = options;
  if (!positiveCardSize(cardMm) || typeof includeScan !== 'boolean' || typeof includeLeaveOneOut !== 'boolean') {
    return refusal('INVALID_INPUT', 'Οι διαστάσεις της κάρτας ή οι επιλογές μέτρησης είναι άκυρες.');
  }
  const prepared = prepareViews(views, cardMm);
  if (!prepared.ok) return prepared;
  const fit = fitArc(prepared.views);
  if (!fit.ok) return fit;

  const { arc, frames, radiusSigmaMm, sagittaSigmaMm, alternativeRadiusMm } = fit;
  const radiusMm = arc.radius;
  const chordMm = 2 * arc.half;
  const sagittaMm = arc.sag;
  const arcLengthMm = 2 * radiusMm * Math.asin(Math.min(1, arc.half / radiusMm));
  let sumSquared = 0;
  let count = 0;
  const diagnostics = [];
  for (const frame of frames) {
    const squared = frame.samples.reduce((sum, sample) => sum + sample.squaredError, 0);
    const samples = frame.samples.length;
    diagnostics.push(diagnoseView(frame, arc, Math.sqrt(squared / samples)));
    sumSquared += squared;
    count += samples;
  }
  const edgeRmsPx = Math.sqrt(sumSquared / count);
  const viewSpreadDeg = viewSpread(prepared.views, arc.mid);
  if (![radiusMm, chordMm, sagittaMm, arcLengthMm, edgeRmsPx, viewSpreadDeg].every(Number.isFinite)) {
    return refusal('ARC_FIT_FAILED', 'Οι διαστάσεις ή το σφάλμα του τόξου δεν μπορούν να υπολογιστούν.');
  }
  const scan = includeScan ? scanWithPose(prepared.views) : null;
  const disagreementPct = scan?.ok ? 100 * Math.abs(scan.radiusMm / radiusMm - 1) : null;
  const { viewCheck, leaveOneOut } = checkViewOmissions(prepared.views, fit, includeLeaveOneOut, options.viewCheck !== false);
  const warningResult = measurementWarnings({ viewSpreadDeg, disagreementPct, leaveOneOut, diagnostics, scan,
    radiusMm, alternativeRadiusMm, viewCheck });
  return {
    ok: true, code: 'OK', message: LABEL, radiusMm, chordMm, sagittaMm, arcLengthMm,
    edgeRmsPx, viewSpreadDeg, views: diagnostics, scan, disagreementPct, leaveOneOut,
    radiusSigmaMm, sagittaSigmaMm, alternativeRadiusMm, viewCheck, ...warningResult,
  };
}
