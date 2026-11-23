import { focalFromCards } from './card-focal.mjs';
import { CARD_ORDER_LIMITS, checkCardOrder } from './card-order.mjs';
import { measureArc, poseFromCard } from './core/multiview-arc.mjs';
import { buildViews, CARD_MM, MAX_PHOTOS, MIN_PHOTOS, sameFrameSize } from './views.mjs';

export const MEASUREMENT_OPTIONS = Object.freeze({ cardMm: CARD_MM, scan: true, leaveOneOut: true });
export const FOCAL_LIMITS = Object.freeze({
  fileDisagreementSigma: 3,
  cornerSigmaPx: 0.5,
  singleViewCornerSigmaPx: 1,
  exactReprojectionPx: 1e-9,
});
const RADIUS_ONLY = Object.freeze({ cardMm: CARD_MM, scan: false, leaveOneOut: false, viewCheck: false });
const TWO_VIEW_COST_MARGIN = 4;

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

export function calculateMeasurement(included, sameLensConfirmed, { guidedFan = false } = {}) {
  if (included.length < MIN_PHOTOS) return { ok: false, code: 'TOO_FEW_VIEWS' };
  if (included.length > MAX_PHOTOS) return { ok: false, code: 'TOO_MANY_VIEWS' };
  const fromCard = included.some(({ view }) => view.focalPx === null);
  const focal = {
    source: fromCard ? 'card' : 'exif', card: null,
    referenceSize: null, cornerSigmaPx: null, disagreement: false,
  };
  let cardOrder = null;
  const refuse = code => ({ ok: false, code, focal, cardOrder });
  if (fromCard || guidedFan) {
    if (!sameFrameSize(included)) return refuse('FRAME_SIZE_MISMATCH');
    if (!sameLensConfirmed) return refuse('SAME_LENS_REQUIRED');
  }

  const fileArc = fromCard ? null : measureViews(included.map(({ view }) => view), { checkOppositeCorner: guidedFan });
  if (fileArc?.ok && guidedFan) cardOrder = { ok: true, oppositeCornerChecked: true };
  const { corners, scales, width, height } = cardFocalInput(included);
  const options = {
    width, height, cx: 0, cy: 0, cardMm: CARD_MM,
    cornerSigmaPx: exactReprojections(fileArc) ? 0 : FOCAL_LIMITS.cornerSigmaPx,
  };
  if (guidedFan && differentFanOptics(included, corners, options)) return refuse('FAN_OPTICS_DISAGREE');
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

// A logical camera can switch internally while its public settings stay fixed.
// Only compare sufficiently informative card images; lack of evidence cannot
// establish the physical identity of a lens.
function differentFanOptics(included, corners, options) {
  const fileFocals = included.map(({ view }) => view.focalPx).filter(Number.isFinite);
  if (fileFocals.length && Math.max(...fileFocals) - Math.min(...fileFocals) > FOCAL_LIMITS.exactReprojectionPx) return true;
  // The local input study includes manual corner noise up to one pixel.
  // Give each image its own uncertainty interval before comparing two images.
  const estimates = corners.map(image => focalFromCards([image], { ...options, cornerSigmaPx: FOCAL_LIMITS.singleViewCornerSigmaPx }))
    .filter(estimate => estimate.ok);
  return estimates.some((a, i) => estimates.slice(i + 1).some(b => {
    const intervalWidths = a.focalPx * a.focalSigmaRel + b.focalPx * b.focalSigmaRel;
    const tolerance = CARD_ORDER_LIMITS.metricTolerance * (a.focalPx + b.focalPx) / 2;
    return Math.abs(a.focalPx - b.focalPx) > Math.max(tolerance, CARD_ORDER_LIMITS.comparisonFactor * intervalWidths);
  }));
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

function endpointOrderIssue(frames, views) {
  const pairs = [];
  for (const [i, a] of frames.entries()) {
    for (let j = 0; j < i; j++) {
      const current = endpointPairCost(a, frames[j], false);
      const reversed = endpointPairCost(a, frames[j], true);
      if (!Number.isFinite(current) || !Number.isFinite(reversed)) continue;
      pairs.push({ i, j, current, reversed });
    }
  }
  // Reversing every view just renames the endpoints. Fix the first one and
  // compare the remaining partitions (at most 512 for ten marked views).
  let bestGain = 0;
  let bestMask = 0;
  for (let mask = 2; mask < 2 ** frames.length; mask += 2) {
    let submitted = 0;
    let alternative = 0;
    let count = 0;
    for (const pair of pairs) {
      if (((mask >> pair.i) & 1) === ((mask >> pair.j) & 1)) continue;
      submitted += pair.current;
      alternative += pair.reversed;
      count += 4;
    }
    if (!count) continue;
    const currentRms = Math.sqrt(submitted / count);
    const reversedRms = Math.sqrt(alternative / count);
    if (orderClearlyFitsBetter(currentRms, reversedRms)) return 'EDGE_END_ORDER';
    // With only two weakly discriminating views, check both complete fits
    // even when numerical noise puts the submitted assignment first.
    if (frames.length === 2 && !orderClearlyFitsBetter(reversedRms, currentRms)) bestMask = mask;
    const gain = submitted - alternative;
    if (gain > bestGain) {
      bestGain = gain;
      bestMask = mask;
    }
  }
  if (!bestMask) return null;

  // Almost collinear epipolar lines constrain only the perpendicular error.
  // Check whether the competing assignment also explains the whole curve.
  const alternativeViews = views.map((view, i) => bestMask & (1 << i)
    ? { ...view, edgePx: [...view.edgePx].reverse() } : view);
  const alternativeFit = measureArc(alternativeViews, RADIUS_ONLY);
  if (!alternativeFit.ok) return null;
  const submittedFit = measureArc(views, RADIUS_ONLY);
  if (!submittedFit.ok) return 'EDGE_END_ORDER';
  const current = submittedFit.edgeRmsPx;
  const alternative = alternativeFit.edgeRmsPx;
  if (views.length === 2) {
    // Και τα δύο τόξα έχουν τις ίδιες παραμέτρους και ακριβώς τα ίδια σημεία.
    // Με δύο όψεις δεν υπάρχει τρίτη που να λύνει ισοπαλία των αντιστοιχίσεων.
    const count = views[0].edgePx.length + views[1].edgePx.length;
    const noise = Math.max(CARD_ORDER_LIMITS.comparisonFloorPx, Math.min(current, alternative));
    const difference = count * (current * current - alternative * alternative) / (noise * noise);
    if (difference > TWO_VIEW_COST_MARGIN) return 'EDGE_END_ORDER';
    if (difference >= -TWO_VIEW_COST_MARGIN) return 'EDGE_END_AMBIGUOUS';
    return null;
  }
  return current > alternative + CARD_ORDER_LIMITS.comparisonFloorPx
    && current > alternative * CARD_ORDER_LIMITS.comparisonFactor ? 'EDGE_END_ORDER' : null;
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
  let best = null;
  let bestGain = -Infinity;
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
    // Record the strongest competing assignment, not the first bit pattern.
    const gain = current - opposite;
    if (gain > bestGain) {
      bestGain = gain;
      best = { shiftedViews: frames.map((_, index) => index).filter(shifted), currentRmsPx, oppositeRmsPx };
    }
  }
  return best;
}

export function measureViews(views, { checkOppositeCorner = false } = {}) {
  if (views.length < MIN_PHOTOS) return measureArc(views, MEASUREMENT_OPTIONS);
  if (views.length > MAX_PHOTOS) return { ok: false, code: 'TOO_MANY_VIEWS' };
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
  const endpointIssue = endpointOrderIssue(frames, views);
  if (endpointIssue) return { ok: false, code: endpointIssue };
  if (checkOppositeCorner) {
    const oppositeCorner = competingOppositeCorner(frames);
    if (oppositeCorner !== null) return { ok: false, code: 'CARD_ORDER_UNCERTAIN', oppositeCorner };
  }
  return measureArc(views, MEASUREMENT_OPTIONS);
}
