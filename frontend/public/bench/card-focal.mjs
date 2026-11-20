// Πειραματικό · V2-card-focal-001 · 0.1.0
// Προέλευση της εκτίμησης: focal_from_cards, V1-guided-capture-001 · 0.1.

export const VERSION = '0.1.0';

const LABEL = `Πειραματικό · V2-card-focal-001 · ${VERSION}`;
const DEFAULT_CARD_MM = [85.60, 53.98];
const LIMITS = {
  minPerspectivePower: 1e-14, // όριο της V1 για το άθροισμα των τετραγώνων
  minTiltDeg: 5, // προσωρινό όριο για σχεδόν μετωπικές όψεις
  maxFocalSigmaRel: 0.02, // προσωρινό όριο για σχετικό τυπικό σφάλμα 2%
};
const MIN_TILT_SIN_SQUARED = Math.sin(LIMITS.minTiltDeg * Math.PI / 180) ** 2;
const HOMOGRAPHY_EPSILON = 32 * Number.EPSILON;
const DERIVATIVE_STEP_PX = 0.01;

function refusal(code, message) {
  return { ok: false, code, message: `${LABEL}. ${message}` };
}

function isPoint(point) {
  return Array.isArray(point) && point.length === 2
    && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

// Μέσοι όροι του u (ή του v) με βάρη 1, X, Y, XY στις τέσσερις γωνίες.
function moments(pixels, axis) {
  const u0 = pixels[axis];
  const u1 = pixels[axis + 2];
  const u2 = pixels[axis + 4];
  const u3 = pixels[axis + 6];
  const top = u1 - u0;
  const bottom = u2 - u3;
  return {
    mean: (u0 + u1 + u2 + u3) / 4,
    x: (top + bottom) / 4,
    y: ((u3 - u0) + (u2 - u1)) / 4,
    xy: (bottom - top) / 4,
  };
}

function constraints(pixels, halfWidth, halfHeight) {
  const u = moments(pixels, 0);
  const v = moments(pixels, 1);

  // Ο παρονομαστής της ομογραφίας είναι 1 + gX + hY.
  // Ο μέσος όρος με βάρη XY μηδενίζει τον αριθμητή και δίνει σύστημα 2×2 για g, h.
  const scale = Math.max(Math.abs(u.y), Math.abs(u.x), Math.abs(v.y), Math.abs(v.x));
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const uy = u.y / scale;
  const ux = u.x / scale;
  const vy = v.y / scale;
  const vx = v.x / scale;
  const det = uy * vx - ux * vy;
  if (Math.abs(det) <= HOMOGRAPHY_EPSILON) return null;
  const rhsU = -u.xy / scale;
  const rhsV = -v.xy / scale;
  const g = (rhsU * vx - ux * rhsV) / det;
  const h = (uy * rhsV - rhsU * vy) / det;
  if (!(1 - Math.abs(g) - Math.abs(h) > HOMOGRAPHY_EPSILON)) return null;

  // Οι δύο πρώτες στήλες της ομογραφίας ανά mm της κάρτας.
  const x1 = (u.x + g * u.mean + h * u.xy) / halfWidth;
  const y1 = (v.x + g * v.mean + h * v.xy) / halfWidth;
  const z1 = g / halfWidth;
  const x2 = (u.y + g * u.xy + h * u.mean) / halfHeight;
  const y2 = (v.y + g * v.xy + h * v.mean) / halfHeight;
  const z2 = h / halfHeight;

  const xy1Squared = x1 * x1 + y1 * y1;
  const xy2Squared = x2 * x2 + y2 * y2;
  const normSquared = xy1Squared + xy2Squared + z1 * z1 + z2 * z2;
  if (!(normSquared > 0) || !Number.isFinite(normSquared)) return null;
  const a0 = 2 * (x1 * x2 + y1 * y2) / normSquared;
  const a1 = (xy1Squared - xy2Squared) / normSquared;
  const b0 = 2 * z1 * z2 / normSquared;
  const b1 = (z1 * z1 - z2 * z2) / normSquared;
  const xyTrace = (xy1Squared + xy2Squared) / normSquared;
  return { numerator: -(a0 * b0 + a1 * b1), power: b0 * b0 + b1 * b1, a0, a1, xyTrace };
}

function relativeFocalSigma(normalizedViews, halfWidth, halfHeight, width, ratioSquared, numerator, sigmaPx) {
  const step = DERIVATIVE_STEP_PX / width;
  let gradientNorm = 0;
  for (const pixels of normalizedViews) {
    for (let i = 0; i < pixels.length; i++) {
      const base = pixels[i];
      const upper = base + step;
      const lower = base - step;
      const intervalPx = (upper - lower) * width;
      if (!(intervalPx > 0) || !Number.isFinite(intervalPx)) return Infinity;

      pixels[i] = upper;
      const plus = constraints(pixels, halfWidth, halfHeight);
      pixels[i] = lower;
      const minus = constraints(pixels, halfWidth, halfHeight);
      pixels[i] = base;
      if (plus === null || minus === null) return Infinity;

      // Παράγωγος του log(f). Αλλάζουν μόνο οι όροι της συγκεκριμένης όψης.
      const deltaNumerator = plus.numerator - minus.numerator;
      const deltaPower = plus.power - minus.power;
      const derivative = (deltaNumerator - ratioSquared * deltaPower) / intervalPx / (2 * numerator);
      gradientNorm = Math.hypot(gradientNorm, derivative);
    }
  }
  return sigmaPx * gradientNorm;
}

export function focalFromCards(cornersPerView, options) {
  if (!Array.isArray(cornersPerView) || cornersPerView.length === 0
      || options === null || typeof options !== 'object' || Array.isArray(options)) {
    return refusal('BAD_INPUT', 'Δώσε τουλάχιστον μία όψη και τις διαστάσεις της εικόνας.');
  }
  const { width, height, cx = width / 2, cy = height / 2,
    cardMm = DEFAULT_CARD_MM, cornerSigmaPx = 0.5 } = options;
  if (![width, height, cx, cy, cornerSigmaPx].every(Number.isFinite)
      || width <= 0 || height <= 0 || cornerSigmaPx < 0
      || !isPoint(cardMm) || cardMm[0] <= 0 || cardMm[1] <= 0) {
    return refusal('BAD_INPUT', 'Έλεγξε τις διαστάσεις της εικόνας και της κάρτας, το κύριο σημείο και τον θόρυβο.');
  }
  const halfWidth = cardMm[0] / 2;
  const halfHeight = cardMm[1] / 2;
  let numerator = 0;
  let power = 0;
  let hasInformativeView = false;
  const perView = [];
  const normalizedViews = [];
  for (const corners of cornersPerView) {
    if (!Array.isArray(corners) || corners.length !== 4) {
      return refusal('BAD_INPUT', 'Σημείωσε τέσσερις γωνίες της κάρτας σε κάθε όψη.');
    }
    const pixels = [];
    for (const point of corners) {
      if (!isPoint(point)) return refusal('BAD_INPUT', 'Ξανασημείωσε τις τέσσερις γωνίες της κάρτας.');
      pixels.push((point[0] - cx) / width, (point[1] - cy) / width);
    }
    const terms = constraints(pixels, halfWidth, halfHeight);
    if (terms === null) {
      return refusal('BAD_INPUT', 'Έλεγξε τη σειρά των γωνιών και σημείωσε τέσσερις ξεχωριστές γωνίες της κάρτας.');
    }
    normalizedViews.push(pixels);
    const { numerator: viewNumerator, power: viewPower, a0, a1, xyTrace } = terms;
    numerator += viewNumerator;
    power += viewPower;

    // Η ανισότητα των δύο ιδιοτιμών του μέρους xy δίνει sin²(κλίση), χωρίς εστιακή.
    const eigenGap = Math.hypot(a0, a1);
    const sinTiltSquared = 2 * eigenGap / (xyTrace + eigenGap);
    const informative = viewPower > LIMITS.minPerspectivePower && sinTiltSquared > MIN_TILT_SIN_SQUARED;
    hasInformativeView ||= informative;
    const ratio = informative && viewNumerator > 0 ? Math.sqrt(viewNumerator / viewPower) : null;
    perView.push({ view: perView.length + 1, informative, ratio });
  }
  if (!hasInformativeView) {
    return refusal('CARD_FRONTAL', 'Τράβηξε τις φωτογραφίες πιο λοξά ως προς την κάρτα.');
  }
  const ratioSquared = numerator / power;
  if (!(ratioSquared > 0) || !Number.isFinite(ratioSquared)) {
    return refusal('NOT_POSITIVE', 'Έλεγξε τη σειρά των γωνιών και τράβηξε ξανά τις όψεις με τον ίδιο φακό.');
  }
  const focalPx = width * Math.sqrt(ratioSquared);
  const focalSigmaRel = cornerSigmaPx === 0 ? 0 : relativeFocalSigma(
    normalizedViews, halfWidth, halfHeight, width, ratioSquared, numerator, cornerSigmaPx);
  if (!Number.isFinite(focalPx) || focalPx <= 0 || !(focalSigmaRel <= LIMITS.maxFocalSigmaRel)) {
    return refusal('FOCAL_UNCERTAIN', 'Τράβηξε περισσότερες λοξές όψεις όπου η κάρτα φαίνεται καθαρά και ολόκληρη.');
  }
  return { ok: true, focalPx, focalSigmaRel, views: perView.length, perView, conditioning: Math.sqrt(power) };
}
