import { focalFromCards } from './card-focal.mjs';
import { CARD_ORDER_LIMITS, checkCardOrder } from './card-order.mjs';
import { measureArc, poseFromCard } from './core/multiview-arc.mjs';
import { buildViews, CARD_MM, MIN_PHOTOS, sameFrameSize } from './views.mjs';

export const MEASUREMENT_OPTIONS = Object.freeze({ cardMm: CARD_MM, scan: true, leaveOneOut: true });
export const FOCAL_LIMITS = Object.freeze({
  fileDisagreementSigma: 3,
  cornerSigmaPx: 0.5,
  exactReprojectionPx: 1e-9,
});
const RADIUS_ONLY = Object.freeze({ cardMm: CARD_MM, scan: false, leaveOneOut: false, viewCheck: false });

export function prepareMeasurement(photos, cardConfirmed) {
  if (!cardConfirmed) return null;
  const included = buildViews(photos);
  return included.length >= MIN_PHOTOS ? included : null;
}

function cardFocalInput(included) {
  const width = Math.max(included[0].width, included[0].height);
  const height = Math.min(included[0].width, included[0].height);
  const diagonal = Math.hypot(width, height);
  // Στη διασταύρωση EXIF φέρνουμε πρώτα τυχόν διαφορετικά μεγέθη
  // στην ίδια διαγώνιο. Οι όψεις που θα μετρηθούν κρατούν τα δικά τους pixel.
  const scales = included.map(photo => diagonal / Math.hypot(photo.width, photo.height));
  const corners = included.map(({ view }, i) =>
    view.cornersPx.map(([x, y]) => [(x - view.cx) * scales[i], (y - view.cy) * scales[i]]));
  return { corners, scales, width, height };
}

function focalRadiusError(views, radiusSigmaMm, focalSigmaRel) {
  const shiftedResults = [1 + focalSigmaRel, 1 - focalSigmaRel].map(factor =>
    measureArc(views.map(view => ({ ...view, focalPx: view.focalPx * factor })), RADIUS_ONLY));
  const [high, low] = shiftedResults;
  if (!high.ok || !low.ok) return null;
  const focalRadiusSigmaMm = Math.abs(high.radiusMm - low.radiusMm) / 2;
  const totalRadiusSigmaMm = Math.hypot(radiusSigmaMm, focalRadiusSigmaMm);
  if (!Number.isFinite(totalRadiusSigmaMm)) return null;
  return {
    radiusAtHigherFocalMm: high.radiusMm,
    radiusAtLowerFocalMm: low.radiusMm,
    focalRadiusSigmaMm,
    totalRadiusSigmaMm,
  };
}

function exactReprojections(arc) {
  return arc?.ok && arc.edgeRmsPx <= FOCAL_LIMITS.exactReprojectionPx
    && arc.views.every(view => view.cardRmsPx <= FOCAL_LIMITS.exactReprojectionPx);
}

export function calculateMeasurement(included, sameLensConfirmed) {
  if (included.length < MIN_PHOTOS) return { ok: false, code: 'TOO_FEW_VIEWS' };
  const fromCard = included.some(({ view }) => view.focalPx === null);
  const focal = {
    source: fromCard ? 'card' : 'exif', card: null,
    referenceSize: null, cornerSigmaPx: null, disagreement: false,
  };
  let cardOrder = null;
  const refuse = code => ({ ok: false, code, focal, cardOrder });
  if (fromCard) {
    if (!sameFrameSize(included)) return refuse('FRAME_SIZE_MISMATCH');
    if (!sameLensConfirmed) return refuse('SAME_LENS_REQUIRED');
  }

  const fileArc = fromCard ? null : measureViews(included.map(({ view }) => view));
  const { corners, scales, width, height } = cardFocalInput(included);
  const options = {
    width, height, cx: 0, cy: 0, cardMm: CARD_MM,
    cornerSigmaPx: exactReprojections(fileArc) ? 0 : FOCAL_LIMITS.cornerSigmaPx,
  };
  const estimate = focalFromCards(corners, options);
  focal.card = estimate;
  focal.referenceSize = [width, height];
  focal.cornerSigmaPx = options.cornerSigmaPx;
  if (fromCard) {
    cardOrder = checkCardOrder(included, estimate.ok ? estimate.focalPx : null);
    if (!cardOrder.ok) return refuse('CARD_ORDER_UNCERTAIN');
    if (!estimate.ok) return refuse(estimate.code);
  }
  const { focalPx, focalSigmaRel } = estimate;
  const views = included.map(({ view }) => fromCard ? { ...view, focalPx } : view);
  if (!fromCard && estimate.ok) {
    const warningPx = Math.max(FOCAL_LIMITS.exactReprojectionPx, FOCAL_LIMITS.fileDisagreementSigma * focalSigmaRel * focalPx);
    focal.disagreement = views.some((view, i) => Math.abs(view.focalPx * scales[i] - focalPx) > warningPx);
  }

  const arc = fileArc ?? measureViews(views, { checkOppositeCorner: true });
  if (arc.oppositeCorner) {
    const { shiftedViews, ...costs } = arc.oppositeCorner;
    cardOrder = { ...cardOrder, ok: false, oppositeCorner: {
      shiftedPhotoIds: shiftedViews.map(index => included[index].photoId), ...costs,
    } };
  }
  if (!arc.ok) return { ...arc, focal, cardOrder };
  if (!estimate.ok) return refuse(estimate.code);
  if (!fromCard) return { ...arc, focal, cardOrder, totalRadiusSigmaMm: arc.radiusSigmaMm };

  // Αν και η κάρτα και η άκρη ταιριάζουν μέχρι τη στρογγυλοποίηση,
  // χρησιμοποιούμε τη ρύθμιση της μονάδας για ακριβείς συντεταγμένες.
  // Ο αρχικός έλεγχος με 0,5 px έχει ήδη αποκλείσει ασθενή γεωμετρία.
  if (exactReprojections(arc)) {
    focal.cornerSigmaPx = 0;
    focal.card = focalFromCards(corners, { ...options, cornerSigmaPx: 0 });
    if (!focal.card.ok) return refuse(focal.card.code);
  }
  const uncertainty = focalRadiusError(views, arc.radiusSigmaMm, focal.card.focalSigmaRel);
  if (uncertainty === null) return refuse('FOCAL_RADIUS_UNCERTAIN');
  return { ...arc, focal, cardOrder, ...uncertainty };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function multiplyRotation(matrix, vector) {
  return [
    dot(matrix.slice(0, 3), vector), dot(matrix.slice(3, 6), vector), dot(matrix.slice(6, 9), vector),
  ];
}

function endpointRays(view, pose) {
  const { rotation, centerMm } = pose;
  const inverse = [
    rotation[0], rotation[3], rotation[6],
    rotation[1], rotation[4], rotation[7],
    rotation[2], rotation[5], rotation[8],
  ];
  const points = [view.edgePx[0], view.edgePx[view.edgePx.length - 1]]
    .map(([x, y]) => [x - view.cx, y - view.cy, view.focalPx]);
  const rays = points.map(point => multiplyRotation(inverse, point));
  return { rotation, centerMm, points, rays };
}

// Στο επίπεδο που περνά από τα δύο κέντρα καμερών και την πρώτη ακτίνα
// πρέπει να βρίσκεται και η δεύτερη ακτίνα του ίδιου φυσικού άκρου.
function squaredLineDistance(from, fromIndex, to, toIndex) {
  const baseline = to.centerMm.map((value, i) => value - from.centerMm[i]);
  const normal = cross(baseline, from.rays[fromIndex]);
  const line = multiplyRotation(to.rotation, normal);
  const length = Math.hypot(line[0], line[1]);
  if (!(length > Number.EPSILON * Math.hypot(...baseline) * Math.hypot(...from.rays[fromIndex]))) return NaN;
  return (dot(line, to.points[toIndex]) / length) ** 2;
}

function endpointPairCost(a, b, reversed) {
  const first = reversed ? 1 : 0;
  const last = 1 - first;
  return squaredLineDistance(a, 0, b, first) + squaredLineDistance(a, 1, b, last)
    + squaredLineDistance(b, first, a, 0) + squaredLineDistance(b, last, a, 1);
}

// Εδώ συγκρίνονται δύο σειρές των ίδιων σημείων. Ζητάμε ισχυρή διαφορά
// με πάτωμα μισού pixel, ώστε πολύ μικρές διαφορές να μην αλλάζουν τη σειρά.
function orderClearlyFitsBetter(currentRms, alternativeRms) {
  return currentRms > CARD_ORDER_LIMITS.comparisonFactor * Math.max(CARD_ORDER_LIMITS.comparisonFloorPx, alternativeRms);
}

function hasReversedEndpoints(frames) {
  const totals = frames.map(() => ({ current: 0, reversed: 0, distances: 0 }));
  for (const [i, a] of frames.entries()) {
    for (let j = 0; j < i; j++) {
      const current = endpointPairCost(a, frames[j], false);
      const reversed = endpointPairCost(a, frames[j], true);
      if (!Number.isFinite(current) || !Number.isFinite(reversed)) continue;
      for (const sum of [totals[i], totals[j]]) {
        sum.current += current;
        sum.reversed += reversed;
        sum.distances += 4;
      }
    }
  }
  return totals.some(({ current, reversed, distances }) => distances > 0
    && orderClearlyFitsBetter(Math.sqrt(current / distances), Math.sqrt(reversed / distances)));
}

function competingOppositeCorner(frames) {
  // Η απέναντι αρχική γωνία στρέφει το σύστημα της κάρτας κατά 180°.
  // Οι προβολές της κάρτας μένουν ίδιες. Συγκρίνουμε τα ίδια φυσικά άκρα.
  const turn = ([x, y, z]) => [-x, -y, z];
  const turned = frames.map(frame => ({
    ...frame,
    rotation: [0, 3, 6].flatMap(start => turn(frame.rotation.slice(start, start + 3))),
    centerMm: turn(frame.centerMm),
    rays: frame.rays.map(turn),
  }));
  const pairs = [];
  for (const [i, frame] of frames.entries()) {
    for (let j = 0; j < i; j++) {
      const current = endpointPairCost(frame, frames[j], false);
      const opposite = endpointPairCost(frame, turned[j], false);
      if (Number.isFinite(current) && Number.isFinite(opposite)) pairs.push({ i, j, current, opposite });
    }
  }

  // Η πρώτη όψη ορίζει την αρχή. Αν αλλάξουν όλες, αλλάζουν μόνο οι άξονες.
  for (let mask = 2; mask < 2 ** frames.length; mask += 2) {
    const shifted = index => Boolean(mask & (1 << index));
    let current = 0;
    let opposite = 0;
    let distances = 0;
    for (const pair of pairs) {
      if (shifted(pair.i) === shifted(pair.j)) continue;
      current += pair.current;
      opposite += pair.opposite;
      distances += 4;
    }
    const currentRmsPx = distances > 0 ? Math.sqrt(current / distances) : null;
    const oppositeRmsPx = distances > 0 ? Math.sqrt(opposite / distances) : null;
    if (distances > 0 && orderClearlyFitsBetter(oppositeRmsPx, currentRmsPx)) continue;
    return { shiftedViews: frames.map((_, index) => index).filter(shifted), currentRmsPx, oppositeRmsPx };
  }
  return null;
}

export function measureViews(views, { checkOppositeCorner = false } = {}) {
  if (views.length < MIN_PHOTOS) return measureArc(views, MEASUREMENT_OPTIONS);
  const frames = [];
  for (const view of views) {
    const pose = poseFromCard(view.cornersPx, view, CARD_MM);
    if (!pose.ok) return pose;
    const [first, ...others] = view.cornersPx;
    const shifted = poseFromCard([...others, first], view, CARD_MM);
    if (shifted.ok && orderClearlyFitsBetter(pose.cardRmsPx, shifted.cardRmsPx)) {
      return { ok: false, code: 'CARD_SIDE_ORDER' };
    }
    frames.push(endpointRays(view, pose));
  }
  if (checkOppositeCorner) {
    const oppositeCorner = competingOppositeCorner(frames);
    if (oppositeCorner !== null) return { ok: false, code: 'CARD_ORDER_UNCERTAIN', oppositeCorner };
  }
  if (hasReversedEndpoints(frames)) return { ok: false, code: 'EDGE_END_ORDER' };
  return measureArc(views, MEASUREMENT_OPTIONS);
}
