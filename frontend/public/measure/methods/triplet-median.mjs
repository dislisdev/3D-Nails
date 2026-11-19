// Πειραματικό · Προέλευση: εκτίμηση · Έκδοση 0.4.0 · Y3a-methods-004.
// Περίκυκλος (Ευκλείδης IV.5), διάμεσος/MAD (Huber, 1981), γεωμετρική
// διάμεσος (Weiszfeld, 1937, τροποποίηση για σύμπτωση), jackknife σημείων,
// ανίχνευση εκτόπων με ελάχιστη διάμεσο τετραγώνων (LMedS, Rousseeuw, 1984).
// Μόνο τυπική JavaScript, χωρίς εισαγωγές ή εξαρτήσεις, για Node/browser.
// radius_uncertainty_mm: συντηρητική κλίμακα τυπικής απόκλισης.
// Με 103 σημεία, R 60–3000 px, κανονικό θόρυβο και βέλος/σ 1,9–13:
// RMS(U)/RMSE 1,60–4,83 και κάλυψη 2U 99,8–100% ανά συνθήκη.
// Το REPORT.md δίνει τον σπόρο, τα πλήθη και την κάλυψη των νέων αριθμών.

// Πρώτες επιλογές κόστους/άρνησης, χωρίς ανεξάρτητη επικύρωση.
const MIN_POINTS = 5;
const MIN_DISTINCT_POINTS = 5;
const EXHAUSTIVE_POINT_LIMIT = 12; // Όλες οι τριάδες μόνο σε μικρή είσοδο.
const TRIPLET_OFFSETS = [[1 / 3, 2 / 3], [1 / 4, 3 / 4], [1 / 5, 3 / 5]];
// Πάνω από 12 σημεία: έως 3n τριάδες, με ΚΑΘΕ διαφορετικό σημείο ως άγκυρα.
const MIN_TRIANGLE_SINE = 1e-4; // Αριθμητική σταθερότητα περιγεγραμμένου κύκλου.
const MIN_VALID_CIRCLES = 5;
const MIN_VALID_CIRCLE_FRACTION = 0.25; // Πρέπει να ορίζεται επαρκές μέρος των τριάδων.
const MAD_TO_SD = 1.4826; // Κανονική αναφορά για την ανθεκτική κλίμακα MAD.
const MEDIAN_SD_FACTOR = Math.sqrt(Math.PI / 2); // Ασυμπτωτική SD διαμέσου / μέσου, κανονική αναφορά.
const CORE_QUANTILE = 0.8; // Αξιολογείται το 80% αντί για το μέγιστο υπόλοιπο.
const INLIER_BAND_PX = 1.5; // Ελάχιστη ανοχή συμφωνίας σε κβαντισμένα σημεία.
const INLIER_SIGMAS = 3; // Ανοχή γύρω από τη διάμεσο σε μονάδες MAD.
const MIN_INLIER_FRACTION = 0.70; // Χώρος για 25% έκτοπα και για ουρές του θορύβου.
const REFIT_INLIER_FRACTION = 0.95; // Κόβονται σημεία όταν οι αποκλίσεις είναι περισσότερες από λίγες ουρές.
const MAX_CORE_RESIDUAL_SIGMAS = 3; // Ανοχή του πυρήνα σε μονάδες τοπικού θορύβου.
const MAX_CONSENSUS_TRIALS = 64; // Φραγμένο κόστος ελέγχου κύκλων σε πολλά σημεία.
const CONSENSUS_SEED = 0x451fab81; // Σταθερή δειγματοληψία υποψήφιων κύκλων.
const MIN_SAGITTA_SNR = 5; // Βέλος των συμφωνούντων σημείων ως προς θόρυβο μέσων.
const MIN_SAGITTA_TO_NOISE = 1; // Το βέλος των παραθύρων πρέπει να ξεπερνά τον θόρυβο ενός σημείου.
const SUPPORT_WINDOW_FRACTION = 0.2;
const PIXEL_NOISE_SD = 1 / Math.sqrt(12); // Παραδοχή σφάλματος ±0.5 px και για δεκαδικά.
const JACKKNIFE_GROUPS = 8; // Διαγραφή ομάδων αρχικών σημείων, όχι ανεξάρτητων τριάδων.
const MAX_EFFECTIVE_POINTS = 64; // Συντηρητικό όριο πληροφορίας πυκνής δειγματοληψίας.
const MIN_CURVATURE_SNR = 5; // Αναγνωρισιμότητα από τη συντηρητική αβεβαιότητα τριάδων.
const INVERSE_CURVATURE_SIGMAS = 4; // Περιθώριο για την ασυμμετρία και τη μεροληψία όταν το σήμα είναι ασθενές.
const GEOMETRY_ROUNDOFF = 512 * Number.EPSILON; // Μόνο ακρίβεια κινητής υποδιαστολής.
const MAX_CENTER_ITERATIONS = 16384;
const CENTER_TOLERANCE = 1e-8; // Πρακτική σχετική ανοχή, σε κανονικοποιημένες συντεταγμένες.

export const METHOD_ID = 'triplet-median-v0';
export const METHOD_VERSION = '0.4.0';

function result(status, n, reason, fit = null, diagnostics = null) {
  return {
    method_id: METHOD_ID,
    method_version: METHOD_VERSION,
    status,
    radius_mm: status === 'ok' ? fit.radius_mm : null,
    radius_uncertainty_mm: status === 'ok' ? fit.radius_uncertainty_mm : null,
    center_px: status === 'ok' ? fit.center_px : null,
    reason,
    diagnostics: diagnostics ?? { n_points: n, arc_angle_deg: null, rms_residual_px: null },
    maturity: 'Πειραματικό',
    provenance: 'εκτίμηση',
  };
}

// Μεταφορά και κοινή Ευκλείδεια κλίμακα. Δεν γίνεται αλγεβρική προσαρμογή.
function normalize(points) {
  const [anchorX, anchorY] = points[0];
  let span = 0;
  for (const [x, y] of points) {
    const dx = x - anchorX;
    const dy = y - anchorY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    span = Math.max(span, Math.hypot(dx, dy));
  }
  if (!(span > 0) || !Number.isFinite(span)) return null;
  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < points.length; i += 1) {
    meanX += ((points[i][0] - anchorX) / span - meanX) / (i + 1);
    meanY += ((points[i][1] - anchorY) / span - meanY) / (i + 1);
  }
  const centered = points.map(([x, y]) => [(x - anchorX) / span - meanX,
    (y - anchorY) / span - meanY]);
  let meanSquare = 0;
  for (let i = 0; i < centered.length; i += 1) {
    meanSquare += (centered[i][0] ** 2 + centered[i][1] ** 2 - meanSquare) / (i + 1);
  }
  const rms = Math.sqrt(meanSquare);
  const scale = span * rms;
  const origin = [anchorX + span * meanX, anchorY + span * meanY];
  if (!(scale > 0) || !Number.isFinite(scale) || !origin.every(Number.isFinite)) return null;
  return { points: centered.map(([x, y]) => [x / rms, y / rms]), scale, origin };
}

function median(values) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle]
    : values[middle - 1] + (values[middle] - values[middle - 1]) / 2;
}

function circumcircle(a, b, c) {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const cx = c[0] - a[0];
  const cy = c[1] - a[1];
  const cross = bx * cy - by * cx;
  const sides = Math.hypot(bx, by) * Math.hypot(cx, cy);
  if (!(Math.abs(cross) > MIN_TRIANGLE_SINE * sides)) return null;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (cy * b2 - by * c2) / (2 * cross);
  const uy = (bx * c2 - cx * b2) / (2 * cross);
  const radius = Math.hypot(ux, uy);
  const centerX = a[0] + ux;
  const centerY = a[1] + uy;
  if (![centerX, centerY, radius].every(Number.isFinite) || !(radius > 0)) return null;

  // Μέθοδος δέλτα για τον θόρυβο τριών σημείων: δR = Σ w_i u_i·δp_i,
  // Σw_i u_i = 0, Σw_i = 1. Άρα SD(R) = SD(pixel) sqrt(Σw_i²).
  // Αυτός ο συντελεστής διογκώνεται σε στενά/ασταθή τόξα, χωρίς αλγεβρικό fit.
  const normals = [a, b, c].map(([x, y]) => {
    const distance = Math.hypot(x - centerX, y - centerY);
    return [(x - centerX) / distance, (y - centerY) / distance];
  });
  const [u, v, w] = normals;
  const cross2 = (p, q) => p[0] * q[1] - p[1] * q[0];
  const denominator = cross2([v[0] - u[0], v[1] - u[1]], [w[0] - u[0], w[1] - u[1]]);
  const noiseGain = Math.hypot(cross2(v, w), cross2(w, u), cross2(u, v)) / Math.abs(denominator);
  if (!Number.isFinite(noiseGain) || !(noiseGain > 0)) return null;
  return { cx: centerX, cy: centerY, radius, noiseGain };
}

function triplets(points) {
  const circles = [];
  const seen = new Set();
  let attempted = 0;
  const add = (i, j, k) => {
    const indices = [i, j, k].sort((a, b) => a - b);
    if (indices[0] === indices[1] || indices[1] === indices[2]) return;
    const key = indices.join(',');
    if (seen.has(key)) return;
    seen.add(key);
    attempted += 1;
    const circle = circumcircle(...indices.map(index => points[index]));
    if (circle) circles.push({ ...circle, indices });
  };
  if (points.length <= EXHAUSTIVE_POINT_LIMIT) {
    for (let i = 0; i < points.length - 2; i += 1) {
      for (let j = i + 1; j < points.length - 1; j += 1) {
        for (let k = j + 1; k < points.length; k += 1) add(i, j, k);
      }
    }
  } else {
    for (let i = 0; i < points.length; i += 1) {
      for (const [a, b] of TRIPLET_OFFSETS) {
        add(i, (i + Math.floor(a * points.length)) % points.length,
          (i + Math.floor(b * points.length)) % points.length);
      }
    }
  }
  return { circles, attempted };
}

// Ελαχιστοποίηση Σ||c-c_i||: γεωμετρική διάμεσος αντί για δύο διάμεσους αξόνων.
// Η αρχή, οι αποστάσεις, τα βάρη και η ανοχή είναι Ευκλείδεια: η λύση
// μεταφέρεται/περιστρέφεται μαζί με τα σημεία. Η σύμπτωση δεν διαιρεί με μηδέν.
function geometricMedian(circles, radius) {
  const seed = circles.slice().sort((a, b) => a.radius - b.radius)[Math.floor(circles.length / 2)];
  let x = seed.cx;
  let y = seed.cy;
  for (let iteration = 0; iteration < MAX_CENTER_ITERATIONS; iteration += 1) {
    const tolerance = CENTER_TOLERANCE * Math.max(1, radius, Math.hypot(x, y));
    let rx = 0;
    let ry = 0;
    let weights = 0;
    let coincident = 0;
    for (const c of circles) {
      const dx = c.cx - x;
      const dy = c.cy - y;
      const distance = Math.hypot(dx, dy);
      if (distance <= tolerance) {
        coincident += 1;
      } else {
        weights += 1 / distance;
        rx += dx / distance;
        ry += dy / distance;
      }
    }
    const gradient = Math.hypot(rx, ry);
    if (gradient <= coincident || weights === 0) return { cx: x, cy: y, iterations: iteration + 1 };
    const factor = 1 - coincident / gradient;
    const stepX = factor * rx / weights;
    const stepY = factor * ry / weights;
    x += stepX;
    y += stepY;
    if (Math.hypot(stepX, stepY) <= tolerance) return { cx: x, cy: y, iterations: iteration + 1 };
  }
  return null;
}

function radiusUncertainty(circles, radius, n, scale) {
  const spread = MAD_TO_SD * median(circles.map(c => Math.abs(c.radius - radius)));
  const groups = Math.min(JACKKNIFE_GROUPS, n);
  const deleted = [];
  for (let g = 0; g < groups; g += 1) {
    // Αφαιρούνται ΟΛΕΣ οι τριάδες που περιέχουν σημείο της ομάδας.
    const remaining = circles.filter(c => c.indices.every(index => index % groups !== g));
    if (remaining.length >= MIN_VALID_CIRCLES) deleted.push(median(remaining.map(c => c.radius)));
  }
  let jackknife = 0;
  if (deleted.length === groups) {
    const mean = deleted.reduce((sum, value) => sum + value / groups, 0);
    jackknife = Math.sqrt((groups - 1) / groups
      * deleted.reduce((sum, value) => sum + (value - mean) ** 2, 0));
  }
  // Πειραματική ΣΥΝΤΗΡΗΤΙΚΗ κλίμακα: μέγιστο delete-group jackknife, MAD ακτίνων και ορίου
  // θορύβου pixel από τη μέθοδο δέλτα. Οι τριάδες ΔΕΝ μετρούν ως ανεξάρτητες:
  // ο παράγοντας sqrt(π/2)*sqrt(3/n_eff) χρησιμοποιεί αρχικά διαφορετικά σημεία
  // (n_eff<=64), με την κανονική ασυμπτωτική διόρθωση διαμέσου αντί μέσου.
  // Για λίγα σημεία χωρίς πλήρες jackknife μένουν τα δύο τελευταία σκέλη.
  // Βλ. REPORT.md για τη μετρημένη συντηρητικότητα της 0.4.0.
  // Δεν περιλαμβάνει αβεβαιότητα mm_per_px ή απόκλιση μη κυκλικού σχήματος.
  const pointFactor = MEDIAN_SD_FACTOR * Math.sqrt(3 / Math.min(n, MAX_EFFECTIVE_POINTS));
  const pixelFloor = PIXEL_NOISE_SD / scale * median(circles.map(c => c.noiseGain)) * pointFactor;
  const linearUncertainty = Math.max(jackknife, spread * pointFactor, pixelFloor,
    CENTER_TOLERANCE * radius);
  const curvatureSnr = radius / linearUncertainty;
  // Τυπική μετατροπή άκρου διαστήματος με κ=1/R, SDκ≈SDR/R²:
  // (1/(κ-z SDκ)-R)/z = SDR/(1-z SDR/R), με z=4.
  // Πρώτη πειραματική προστασία για την επιλογή κοντά στην άρνηση, όχι
  // εγγυημένη πιθανότητα κάλυψης. Το MIN_CURVATURE_SNR κρατά απόσταση από τον πόλο.
  const inverseFactor = 1 / Math.max(1 / MIN_CURVATURE_SNR,
    1 - INVERSE_CURVATURE_SIGMAS / curvatureSnr);
  const uncertainty = linearUncertainty * inverseFactor;
  return { uncertainty, linearUncertainty, curvatureSnr, inverseFactor,
    spread, jackknife, pixelFloor };
}

function radialResiduals(points, circle) {
  return points.map(([x, y]) => Math.hypot(x - circle.cx, y - circle.cy) - circle.radius);
}

function residualSupport(points, residuals, circle, scale, fitPoints) {
  const core = fitPoints === points ? residuals : radialResiduals(fitPoints, circle);
  // Κέντρο και ακτίνα είναι χωριστές διάμεσοι. Η MAD και η ζώνη συμφωνίας
  // μετρούν τις αποκλίσεις από την ίδια διάμεσο υπολοίπων.
  const location = median(core.slice());
  const floor = Math.max(PIXEL_NOISE_SD / scale, GEOMETRY_ROUNDOFF * circle.radius);
  const sigma = Math.max(floor, MAD_TO_SD * median(core.map(value => Math.abs(value - location))));
  const band = Math.max(INLIER_BAND_PX / scale, INLIER_SIGMAS * sigma);
  const inliers = points.filter((_, i) => Math.abs(residuals[i] - location) <= band);
  return { inliers, sigma, floor, location };
}

// Ελάχιστη διάμεσος τετραγώνων ακτινικών υπολοίπων ανάμεσα σε κύκλους τριάδων.
function consensusPoints(points, fit, scale) {
  const { circle, circles } = fit;
  let best = radialResiduals(points, circle);
  let bestCircle = circle;
  const location = median(best.slice());
  let bestScore = median(best.map(value => (value - location) ** 2));
  const trials = Math.min(circles.length, MAX_CONSENSUS_TRIALS);
  let state = CONSENSUS_SEED;
  for (let i = 0; i < trials; i += 1) {
    const first = Math.floor(i * circles.length / trials);
    const end = Math.floor((i + 1) * circles.length / trials);
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const candidate = circles[first + (state >>> 0) % (end - first)];
    const residuals = radialResiduals(points, candidate);
    const score = median(residuals.map(value => value ** 2));
    if (score < bestScore) {
      best = residuals;
      bestCircle = candidate;
      bestScore = score;
    }
  }
  return residualSupport(points, best, bestCircle, scale, points).inliers;
}

function fitTriplets(points) {
  const { circles, attempted } = triplets(points);
  if (circles.length < MIN_VALID_CIRCLES || circles.length / attempted < MIN_VALID_CIRCLE_FRACTION) {
    return { reason: 'Δεν υπάρχουν αρκετές σταθερές τριάδες: σχεδόν ευθεία ή ανεπαρκής γεωμετρία.' };
  }
  const radius = median(circles.map(c => c.radius));
  const center = geometricMedian(circles, radius);
  if (!center) return { reason: 'Η γεωμετρική διάμεσος των κέντρων δεν συγκλίνει.' };
  return { circle: { ...center, radius }, circles, attempted, points };
}

function inspectConsensus(points, circle, scale, fitPoints) {
  const residuals = radialResiduals(points, circle);
  const { inliers, sigma, floor, location } = residualSupport(points, residuals, circle, scale, fitPoints);
  const absolute = residuals.map(value => Math.abs(value - location)).sort((a, b) => a - b);
  const coreResidual = absolute[Math.ceil(CORE_QUANTILE * points.length) - 1];
  const inlierResiduals = radialResiduals(inliers, circle);
  const inlierDeviations = inlierResiduals.map(value => Math.abs(value - location)).sort((a, b) => a - b);
  // Διαδοχικές διαφορές υπολοίπων: σε ανεξάρτητο θόρυβο έχουν διασπορά 2σ².
  // Η σύγκριση με τον πυρήνα διακρίνει αργή απόκλιση του σχήματος από θόρυβο.
  const differences = inlierResiduals.slice(1)
    .map((value, i) => Math.abs(value - inlierResiduals[i]));
  const localSigma = differences.length ? Math.max(floor, MAD_TO_SD / Math.SQRT2 * median(differences)) : floor;
  const coreCompatible = inliers.length >= MIN_POINTS
    && inlierDeviations[Math.ceil(CORE_QUANTILE * inliers.length) - 1] <= MAX_CORE_RESIDUAL_SIGMAS * localSigma;
  let meanSquare = 0;
  for (let i = 0; i < residuals.length; i += 1) {
    meanSquare += (residuals[i] ** 2 - meanSquare) / (i + 1);
  }
  let arc = 0;
  let supportArc = 0;
  let sagittaToNoise = 0;
  let sagittaSnr = 0;
  if (inliers.length >= MIN_POINTS) {
    const angles = inliers.map(([x, y]) => Math.atan2(y - circle.cy, x - circle.cx)).sort((a, b) => a - b);
    let gap = angles[0] + 2 * Math.PI - angles.at(-1);
    for (let i = 1; i < angles.length; i += 1) gap = Math.max(gap, angles[i] - angles[i - 1]);
    const fittedArc = (2 * Math.PI - gap) * 180 / Math.PI;
    // Χωριστό diagnostic στήριξης. Οι μέσοι παραθύρων δεν ορίζουν την
    // αναφερόμενη πλήρη γωνία και κανένα γωνιακό όριο δεν αποφασίζει άρνηση.
    const window = Math.max(1, Math.floor(inliers.length * SUPPORT_WINDOW_FRACTION));
    const mean = start => {
      let x = 0;
      let y = 0;
      for (let j = 0; j < window; j += 1) {
        x += (inliers[start + j][0] - x) / (j + 1);
        y += (inliers[start + j][1] - y) / (j + 1);
      }
      return [x, y];
    };
    const first = mean(0);
    const last = mean(inliers.length - window);
    const middle = mean(Math.floor((inliers.length - window) / 2));
    const dx = last[0] - first[0];
    const dy = last[1] - first[1];
    const chord = Math.hypot(dx, dy);
    const height = chord > 0 ? Math.abs(dx * (middle[1] - first[1]) - dy * (middle[0] - first[0])) / chord : 0;
    supportArc = chord > 0 ? 4 * Math.atan2(2 * height, chord) * 180 / Math.PI : 360;
    sagittaToNoise = height / sigma;
    sagittaSnr = sagittaToNoise / Math.sqrt(1.5 / window);
    arc = fittedArc;
  }
  const inlierFraction = inliers.length / points.length;
  return { inlierFraction, compatible: coreCompatible && inlierFraction >= MIN_INLIER_FRACTION,
    sagittaSnr, sagittaToNoise,
    diagnostics: { arc_angle_deg: arc, rms_residual_px: Math.sqrt(Math.max(0, meanSquare)) * scale,
      core_residual_px: coreResidual * scale, robust_sigma_px: sigma * scale,
      residual_median_px: location * scale, local_sigma_px: localSigma * scale,
      support_arc_angle_deg: supportArc, sagitta_snr: sagittaSnr, sagitta_to_noise: sagittaToNoise,
      n_inliers: inliers.length } };
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
  const seen = new Set();
  const distinct = [];
  for (const point of inputPoints) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
      return refuse('Κάθε σημείο πρέπει να περιέχει δύο πεπερασμένους αριθμούς.');
    }
    const key = point.join(',');
    if (!seen.has(key)) distinct.push(point);
    seen.add(key);
  }
  if (distinct.length < MIN_DISTINCT_POINTS) return refuse('Απαιτούνται πέντε διαφορετικά σημεία.');
  const normalized = normalize(distinct);
  if (!normalized) return refuse('Ανεπαρκές αριθμητικό εύρος συντεταγμένων.');
  const { points, scale, origin } = normalized;
  let fit = fitTriplets(points);
  if (fit.reason) return refuse(fit.reason);
  let inspection = inspectConsensus(points, fit.circle, scale, fit.points);
  if (!inspection.compatible || inspection.inlierFraction < REFIT_INLIER_FRACTION) {
    const support = consensusPoints(points, fit, scale);
    if (support.length >= MIN_POINTS && support.length / points.length >= MIN_INLIER_FRACTION
      && support.length < points.length) {
      const refit = fitTriplets(support);
      if (!refit.reason) {
        const refined = inspectConsensus(points, refit.circle, scale, support);
        if (refined.compatible) {
          fit = refit;
          inspection = refined;
        }
      }
    }
  }
  const { circle, circles, attempted } = fit;
  const { radius } = circle;
  const uncertainty = radiusUncertainty(circles, radius, fit.points.length, scale);
  const diagnostics = { n_points: n, n_distinct_points: distinct.length,
    n_triplet_support_points: new Set(circles.flatMap(c => c.indices)).size,
    n_attempted_triplets: attempted, n_valid_triplets: circles.length,
    n_fit_points: fit.points.length, center_iterations: circle.iterations, ...inspection.diagnostics,
    radius_uncertainty_px: uncertainty.uncertainty * scale,
    radius_jackknife_px: uncertainty.jackknife * scale,
    radius_pixel_floor_px: uncertainty.pixelFloor * scale,
    linear_radius_uncertainty_px: uncertainty.linearUncertainty * scale,
    curvature_snr: uncertainty.curvatureSnr,
    uncertainty_inflation: uncertainty.inverseFactor,
    circle_spread_px: uncertainty.spread * scale };
  const centerPx = [origin[0] + scale * circle.cx, origin[1] + scale * circle.cy];
  const radiusMm = radius * scale * caseObj.mm_per_px;
  const uncertaintyMm = uncertainty.uncertainty * scale * caseObj.mm_per_px;
  if (!centerPx.every(Number.isFinite) || !Number.isFinite(radiusMm) || !(radiusMm > 0)
    || !Number.isFinite(uncertaintyMm) || !(uncertaintyMm > 0)
    || Object.values(diagnostics).some(value => !Number.isFinite(value))) {
    return refuse('Η μετατροπή μονάδων ή η αβεβαιότητα υπερβαίνει το αριθμητικό εύρος.');
  }
  if (!inspection.compatible) {
    return refuse('Τα κεντραρισμένα υπόλοιπα δεν υποστηρίζουν κυκλικό τόξο.', diagnostics);
  }
  if (uncertainty.curvatureSnr < MIN_CURVATURE_SNR) {
    return refuse('Η αβεβαιότητα καμπυλότητας από τις τριάδες δεν επιτρέπει ασφαλή αντιστροφή.', diagnostics);
  }
  if (inspection.sagittaSnr < MIN_SAGITTA_SNR || inspection.sagittaToNoise < MIN_SAGITTA_TO_NOISE) {
    return refuse('Το βέλος των συμφωνούντων σημείων δεν διακρίνεται από τον θόρυβο.', diagnostics);
  }
  return result('ok', n, null, { radius_mm: radiusMm, radius_uncertainty_mm: uncertaintyMm,
    center_px: centerPx }, diagnostics);
}
