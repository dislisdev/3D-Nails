// Πειραματικό · Προέλευση: εκτίμηση · Έκδοση: 0.3.0 · Y3a-methods-003.
// Taubin (1991), DOI 10.1109/34.103273. Μόνο τυπική JavaScript για Node/browser.
// radius_uncertainty_mm: συντηρητική κλίμακα SD, ΟΧΙ ισχυρισμός ακριβούς 1σ.
// Δική μας βαθμονόμηση: R=216 px, 120°, n=127, ανεξάρτητος κανονικός θόρυβος
// 0.6 px/άξονα, 600 επαναλήψεις, σπόρος 418921: RMS(u)/RMSE=1.114, κάλυψη 2u=95.67%.
// Στις οριακές συνθήκες 216px/16°, 72px/30°, 648px/10°, n=127, σ=1 px
// και στρογγυλοποίηση, 2000 επαναλήψεις/συνθήκη, σπόρος 836291:
// RMS(u)/RMSE=1.64, 2.04, 3.25 στα αποδεκτά δείγματα. Βλ. CALIBRATION.md
// για τελική μέτρηση άλλων σπόρων, πλήθη αρνήσεων και περιορισμούς.

// Αρχικές επιλογές άρνησης, χωρίς ανεξάρτητη επικύρωση.
const MIN_POINTS = 5; // Το συμβόλαιο απαιτεί τουλάχιστον πέντε σημεία.
const MIN_DISTINCT_POINTS = 5; // Οι επαναλήψεις δεν προσθέτουν γεωμετρική πληροφορία.
const MIN_COVARIANCE_RATIO = 1e-12; // Μόνο αριθμητική προστασία, όχι όριο μετρησιμότητας.
const MAX_RMS_RESIDUAL_PX = 2; // Ανοχή θορύβου εικόνας, ανεξάρτητη από την ακτίνα.
const MAX_POINT_RESIDUAL_PX = 6; // Η Α παραμένει ευαίσθητη σε μεμονωμένα έκτοπα.
const MAX_POINT_RESIDUAL_SIGMAS = 6; // Ουρές ως προς MAD υπολοίπων, όχι ως προς R.
const MAD_TO_SD = 1.4826; // Κανονική αναφορά κλίμακας, μόνο για έλεγχο ποιότητας.
// Δεν αυξάνεται καμία ανοχή υπολοίπων με το R. Η Α κρατά ΟΛΑ τα σημεία,
// και αρνείται όταν υπερβαίνουν το παραπάνω μοντέλο θορύβου εικόνας.
const PIXEL_NOISE_SD = 1 / Math.sqrt(12); // Παραδοχή ομοιόμορφου σφάλματος ±0.5 px.
const MIN_CURVATURE_SNR = 8; // |κ|/SD(κ), πρώτη απαίτηση αναγνωρισιμότητας.
const UNCERTAINTY_SD_FACTOR = 1.1; // Σκόπιμα συντηρητικό, όχι ακριβές 1σ.
const INVERSE_CURVATURE_SIGMAS = 6; // Συντηρητική αντιστροφή κ-6 SD(κ), όχι κάλυψη «6σ».
const SUPPORT_WINDOW_FRACTION = 0.2; // Μέσοι αρχής/μέσου/τέλους για τη στήριξη της γωνίας.
const MIN_SAGITTA_SNR = 5; // Το βέλος πρέπει να διακρίνεται από τον θόρυβο των μέσων.
const MIN_NORMAL_COVARIANCE_DET = 1e-18; // Προστασία αντιστροφής της ακτινικής πληροφορίας.
const MIN_RELATIVE_DETERMINANT = 1e-12; // Προστασία της λύσης για το κέντρο.
const MAX_ROOT_ITERATIONS = 64; // Φραγμένη αριθμητική επίλυση της κυβικής Taubin.
const ROOT_TOLERANCE = 64 * Number.EPSILON; // Αριθμητική ανοχή, όχι όριο ακρίβειας.

export const METHOD_ID = 'taubin-v0';
export const METHOD_VERSION = '0.3.0';

function result(status, n, reason, fit = null, diagnostics = null) {
  return {
    method_id: METHOD_ID,
    method_version: METHOD_VERSION,
    status,
    radius_mm: status === 'ok' ? fit.radius_mm : null,
    radius_uncertainty_mm: status === 'ok' ? fit.radius_uncertainty_mm : null,
    center_px: status === 'ok' ? fit.center_px : null,
    reason,
    diagnostics: diagnostics ?? {
      n_points: n,
      arc_angle_deg: null,
      rms_residual_px: null,
    },
    maturity: 'Πειραματικό',
    provenance: 'εκτίμηση',
  };
}

// Κεντράρισμα και κοινή κλίμακα με RMS απόσταση 1. Δεν αλλάζει το κριτήριο Taubin.
function normalize(points) {
  const [anchorX, anchorY] = points[0];
  let span = 0;
  for (const [x, y] of points) {
    const dx = x - anchorX;
    const dy = y - anchorY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    span = Math.max(span, Math.abs(dx), Math.abs(dy));
  }
  if (!(span > 0)) return null;
  let meanX = 0;
  let meanY = 0;
  let count = 0;
  for (const [x, y] of points) {
    count += 1;
    meanX += ((x - anchorX) / span - meanX) / count;
    meanY += ((y - anchorY) / span - meanY) / count;
  }
  const centered = points.map(([x, y]) => [
    (x - anchorX) / span - meanX,
    (y - anchorY) / span - meanY,
  ]);
  let meanSquare = 0;
  for (let i = 0; i < centered.length; i += 1) {
    const [x, y] = centered[i];
    meanSquare += (x * x + y * y - meanSquare) / (i + 1);
  }
  const rms = Math.sqrt(meanSquare);
  const scale = span * rms;
  const origin = [anchorX + span * meanX, anchorY + span * meanY];
  if (!(scale > 0) || !Number.isFinite(scale) || !origin.every(Number.isFinite)) {
    return null;
  }
  return {
    points: centered.map(([x, y]) => [x / rms, y / rms]),
    scale,
    origin,
  };
}

function moments(points) {
  // Άθροιση Kahan για τις έξι ροπές, σε όλα τα αρχικά σημεία.
  const sum = Array(6).fill(0);
  const correction = Array(6).fill(0);
  for (const [x, y] of points) {
    const z = x * x + y * y;
    const values = [x * x, y * y, x * y, x * z, y * z, z * z];
    for (let j = 0; j < values.length; j += 1) {
      const adjusted = values[j] - correction[j];
      const next = sum[j] + adjusted;
      correction[j] = (next - sum[j]) - adjusted;
      sum[j] = next;
    }
  }
  return sum.map(value => value / points.length);
}

function taubinCircle([mxx, myy, mxy, mxz, myz, mzz]) {
  const mz = mxx + myy;
  const covariance = mxx * myy - mxy * mxy;
  const varianceZ = mzz - mz * mz;
  // det(M - λN) για τον περιορισμό μέσης τετραγωνικής κλίσης του Taubin.
  const a3 = 4 * mz;
  const a2 = -3 * mz * mz - mzz;
  const a1 = varianceZ * mz + 4 * covariance * mz - mxz * mxz - myz * myz;
  const a0 = mxz * (mxz * myy - myz * mxy)
    + myz * (myz * mxx - mxz * mxy) - varianceZ * covariance;
  const coefficientScale = Math.max(Math.abs(a0), Math.abs(a1), Math.abs(a2), Math.abs(a3));
  const tolerance = ROOT_TOLERANCE * coefficientScale;
  const polynomial = x => a0 + x * (a1 + x * (a2 + x * a3));
  let root = 0;
  let value = polynomial(root);
  let converged = Math.abs(value) <= tolerance;
  for (let i = 0; i < MAX_ROOT_ITERATIONS && !converged; i += 1) {
    const derivative = a1 + root * (2 * a2 + root * 3 * a3);
    const next = root - value / derivative;
    if (!Number.isFinite(next) || next < 0) return null;
    const nextValue = polynomial(next);
    if (!Number.isFinite(nextValue) || Math.abs(nextValue) >= Math.abs(value)) return null;
    root = next;
    value = nextValue;
    converged = Math.abs(value) <= tolerance;
  }
  if (!converged) return null;
  const determinant = root * root - root * mz + covariance;
  if (!(determinant > MIN_RELATIVE_DETERMINANT * mz * mz)) return null;
  const cx = (mxz * (myy - root) - myz * mxy) / (2 * determinant);
  const cy = (myz * (mxx - root) - mxz * mxy) / (2 * determinant);
  const radius = Math.sqrt(cx * cx + cy * cy + mz);
  if (![cx, cy, radius].every(Number.isFinite) || !(radius > 0)) return null;
  return { cx, cy, radius };
}

function inspectCircle(points, circle, scale) {
  const angles = [];
  const normals = [];
  const residuals = [];
  let meanSquare = 0;
  let maximum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i];
    const dx = x - circle.cx;
    const dy = y - circle.cy;
    const distance = Math.hypot(dx, dy);
    if (!(distance > 0)) return null;
    const residual = distance - circle.radius;
    residuals.push(residual);
    meanSquare += (residual * residual - meanSquare) / (i + 1);
    maximum = Math.max(maximum, Math.abs(residual));
    angles.push(Math.atan2(dy, dx));
    normals.push([dx / distance, dy / distance]);
  }
  angles.sort((a, b) => a - b);
  let largestGap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i += 1) {
    largestGap = Math.max(largestGap, angles[i] - angles[i - 1]);
  }
  const fittedArc = Math.max(0, Math.min(360, (2 * Math.PI - largestGap) * 180 / Math.PI));
  // Χορδή και βέλος μέσων τριών παραθύρων, χωρίς το κέντρο της προσαρμογής.
  // Οι μέσοι παραθύρων καλύπτουν μικρότερο τμήμα από το πλήρες τόξο.
  // Η γωνία τους αναφέρεται χωριστά, ΔΕΝ περιορίζει την arc_angle_deg.
  // Η arc_angle_deg είναι η κάλυψη γύρω από το εκτιμώμενο κέντρο. Σε κακή
  // προσαρμογή μπορεί να είναι λανθασμένη: δεν χρησιμοποιείται για αποδοχή.
  const window = Math.max(1, Math.floor(points.length * SUPPORT_WINDOW_FRACTION));
  const mean = start => {
    let x = 0;
    let y = 0;
    for (let j = 0; j < window; j += 1) {
      x += (points[start + j][0] - x) / (j + 1);
      y += (points[start + j][1] - y) / (j + 1);
    }
    return [x, y];
  };
  const first = mean(0);
  const last = mean(points.length - window);
  const middle = mean(Math.floor((points.length - window) / 2));
  const chordX = last[0] - first[0];
  const chordY = last[1] - first[1];
  const chord = Math.hypot(chordX, chordY);
  const height = chord > 0 ? Math.abs(chordX * (middle[1] - first[1])
    - chordY * (middle[0] - first[0])) / chord : 0;
  const supportArc = chord > 0 ? 4 * Math.atan2(2 * height, chord) * 180 / Math.PI : 360;
  const rms = Math.sqrt(Math.max(0, meanSquare));
  const median = values => {
    values.sort((a, b) => a - b);
    const m = Math.floor(values.length / 2);
    return values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
  };
  const residualLocation = median(residuals.slice());
  const robustSigma = Math.max(PIXEL_NOISE_SD / scale,
    MAD_TO_SD * median(residuals.map(r => Math.abs(r - residualLocation))),
    ROOT_TOLERANCE * circle.radius);

  // Γραμμικοποίηση γεωμετρικών ακτινικών υπολοίπων: J_i = [u_x, u_y, 1].
  // Var(R) = σ² [(J'J)^-1]RR = σ²(1/n + μ' S^-1 μ),
  // S = Σ(u_i-μ)(u_i-μ)'. Δεν είναι ακριβής πεπερασμένου δείγματος διακύμανση
  // της αλγεβρικής Taubin· είναι τοπική εκτίμηση αναγνωρισιμότητας του κύκλου.
  // Χρησιμοποιούνται όλα τα διαφορετικά σημεία και σ >= 1/sqrt(12) px
  // ακόμη για δεκαδικές εισόδους. Η αβεβαιότητα κλίμακας mm/px δεν περιλαμβάνεται.
  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < normals.length; i += 1) {
    meanX += (normals[i][0] - meanX) / (i + 1);
    meanY += (normals[i][1] - meanY) / (i + 1);
  }
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const [ux, uy] of normals) {
    xx += (ux - meanX) ** 2;
    xy += (ux - meanX) * (uy - meanY);
    yy += (uy - meanY) ** 2;
  }
  const determinant = xx * yy - xy * xy;
  if (!(determinant > MIN_NORMAL_COVARIANCE_DET)) return null;
  const informationFactor = 1 / points.length
    + (yy * meanX ** 2 - 2 * xy * meanX * meanY + xx * meanY ** 2) / determinant;
  const sigma = Math.max(PIXEL_NOISE_SD / scale,
    rms * Math.sqrt(points.length / (points.length - 3)),
    ROOT_TOLERANCE * circle.radius);
  const linearUncertainty = sigma * Math.sqrt(informationFactor);
  // SD(κ) ≈ SD(R)/R². Η αντιστροφή κ±z SD(κ) δεν είναι συμμετρική.
  // (1/(κ-z SDκ)-R)/z = SD(R)/(1-z SD(R)/R), εδώ z=6.
  // Χρησιμοποιούμε το μεγαλύτερο αυτό σκέλος ως συντηρητική συμμετρική κλίμακα,
  // με επιπλέον παράγοντα 1.1. Αρνούμαστε ΠΡΙΝ από τον πόλο της αντιστροφής.
  // Το z=6 είναι πρώτη πειραματική προστασία επιλογής κοντά στην άρνηση,
  // όχι ισχυρισμός κανονικής κάλυψης. Δεν είναι εγγυημένο διάστημα εμπιστοσύνης
  // ούτε περιλαμβάνει συστηματικό
  // σφάλμα σχήματος/κλίμακας ή συσχετισμένο θόρυβο. Βλ. CALIBRATION.md.
  const curvatureSnr = circle.radius / linearUncertainty;
  const inverseFactor = 1 / Math.max(1 / MIN_CURVATURE_SNR,
    1 - INVERSE_CURVATURE_SIGMAS / curvatureSnr);
  const uncertainty = UNCERTAINTY_SD_FACTOR * linearUncertainty * inverseFactor;
  // Var(h) ≈ (1 + 1/2) σ²/window για τρεις μη επικαλυπτόμενους μέσους.
  const sagittaSnr = height / (sigma * Math.sqrt(1.5 / window));
  return {
    diagnostics: { arc_angle_deg: fittedArc, rms_residual_px: rms * scale,
      fitted_arc_angle_deg: fittedArc, support_arc_angle_deg: supportArc,
      radius_uncertainty_px: uncertainty * scale, max_residual_px: maximum * scale,
      robust_sigma_px: robustSigma * scale,
      max_standardized_residual: maximum / robustSigma,
      sagitta_snr: sagittaSnr, curvature_snr: curvatureSnr,
      linear_radius_uncertainty_px: linearUncertainty * scale,
      uncertainty_inflation: UNCERTAINTY_SD_FACTOR * inverseFactor },
    uncertainty,
    rms,
    maximum,
    sagittaSnr,
    curvatureSnr,
    robustSigma,
  };
}

export function estimateRadius(caseObj) {
  const inputPoints = caseObj?.points_px;
  const n = Array.isArray(inputPoints) ? inputPoints.length : 0;
  const refuse = (reason, diagnostics = null) => result('abstain', n, reason, null, diagnostics);
  if (!Array.isArray(inputPoints)) return refuse('Τα σημεία πρέπει να είναι πίνακας.');
  if (n < MIN_POINTS) return refuse('Απαιτούνται τουλάχιστον πέντε σημεία.');
  if (typeof caseObj.mm_per_px !== 'number'
    || !Number.isFinite(caseObj.mm_per_px) || !(caseObj.mm_per_px > 0)) {
    return refuse('Η κλίμακα πρέπει να είναι πεπερασμένος θετικός αριθμός.');
  }
  const unique = new Set();
  for (const point of inputPoints) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
      return refuse('Κάθε σημείο πρέπει να περιέχει δύο πεπερασμένους αριθμούς.');
    }
    unique.add(`${point[0]},${point[1]}`);
  }
  if (unique.size < MIN_DISTINCT_POINTS) return refuse('Απαιτούνται πέντε διαφορετικά σημεία.');
  // Η επανάληψη του ίδιου pixel δεν προσθέτει ανεξάρτητη πληροφορία.
  const distinct = [...unique].map(key => key.split(',').map(Number));
  const normalized = normalize(distinct);
  if (!normalized) return refuse('Ανεπαρκές αριθμητικό εύρος συντεταγμένων.');
  const values = moments(normalized.points);
  const [mxx, myy, mxy] = values;
  const largestEigenvalue = (mxx + myy + Math.hypot(mxx - myy, 2 * mxy)) / 2;
  const covarianceRatio = (mxx * myy - mxy * mxy) / (largestEigenvalue * largestEigenvalue);
  const lineRmsPx = Math.sqrt(Math.max(0, covarianceRatio * largestEigenvalue)) * normalized.scale;
  if (!(covarianceRatio > MIN_COVARIANCE_RATIO)) {
    return refuse('Τα σημεία είναι συγγραμμικά ή σχεδόν σε ευθεία.');
  }
  const circle = taubinCircle(values);
  if (!circle) return refuse('Η αριθμητική λύση Taubin δεν είναι επαρκώς σταθερή.');
  const inspection = inspectCircle(normalized.points, circle, normalized.scale);
  if (!inspection) return refuse('Το τόξο δεν προσδιορίζει σταθερή ακτίνα και αβεβαιότητα.');
  const diagnostics = { n_points: n, n_distinct_points: distinct.length,
    line_rms_px: lineRmsPx, ...inspection.diagnostics };
  const center = [
    normalized.origin[0] + normalized.scale * circle.cx,
    normalized.origin[1] + normalized.scale * circle.cy,
  ];
  const radiusMm = circle.radius * normalized.scale * caseObj.mm_per_px;
  const uncertaintyMm = inspection.uncertainty * normalized.scale * caseObj.mm_per_px;
  if (!center.every(Number.isFinite) || !Number.isFinite(radiusMm) || !(radiusMm > 0)
    || !Number.isFinite(uncertaintyMm) || !(uncertaintyMm > 0)
    || Object.values(diagnostics).some(value => !Number.isFinite(value))) {
    return refuse('Η μετατροπή μονάδων υπερβαίνει το αριθμητικό εύρος.');
  }
  // Μόνο σφάλμα στρογγυλοποίησης κινητής υποδιαστολής, όχι φυσική ανοχή R.
  const roundoffPx = ROOT_TOLERANCE * circle.radius * normalized.scale;
  if (inspection.rms * normalized.scale > MAX_RMS_RESIDUAL_PX + roundoffPx
    || inspection.maximum * normalized.scale > MAX_POINT_RESIDUAL_PX + roundoffPx
    || inspection.maximum > MAX_POINT_RESIDUAL_SIGMAS * inspection.robustSigma) {
    return refuse('Τα ακτινικά υπόλοιπα δεν υποστηρίζουν ένα κυκλικό τόξο.', diagnostics);
  }
  if (inspection.sagittaSnr < MIN_SAGITTA_SNR) {
    return refuse('Το βέλος του τόξου δεν διακρίνεται από τον θόρυβο: σχεδόν ευθεία.', diagnostics);
  }
  if (inspection.curvatureSnr < MIN_CURVATURE_SNR) {
    return refuse('Η αβεβαιότητα καμπυλότητας δεν επιτρέπει ασφαλή αντιστροφή σε ακτίνα.', diagnostics);
  }
  return result('ok', n, null, { radius_mm: radiusMm,
    radius_uncertainty_mm: uncertaintyMm, center_px: center }, diagnostics);
}
