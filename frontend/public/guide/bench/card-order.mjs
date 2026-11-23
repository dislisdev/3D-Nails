import { CARD_MM } from './views.mjs';

export const CARD_ORDER_LIMITS = Object.freeze({
  metricTolerance: 0.03,
  comparisonFloorPx: 0.5,
  comparisonFactor: 4,
});

const aspectRatio = CARD_MM[0] / CARD_MM[1];
const subtract = ([x, y], [u, v]) => [x - u, y - v];
const cross = ([x, y], [u, v]) => x * v - y * u;

function projectiveAxes(view, width) {
  const points = view.cornersPx.map(([x, y]) => [(x - view.cx) / width, (y - view.cy) / width]);
  const edges = points.map((point, i) => subtract(points[(i + 1) % 4], point));
  if (!edges.every((edge, i) => cross(edge, edges[(i + 1) % 4]) < 0)) return null;

  const [a, b, c, d] = points;
  const ac = subtract(c, a);
  const bd = subtract(d, b);
  const ab = subtract(b, a);
  const determinant = cross(ac, bd);
  const t = cross(ab, bd) / determinant;
  const s = cross(ab, ac) / determinant;
  if (!(t > 0 && t < 1 && s > 0 && s < 1)) return null;

  // Το κέντρο της κάρτας είναι η τομή των διαγωνίων. Τα βάρη κάνουν
  // τους απέναντι ομογενείς κόμβους να έχουν το ίδιο μέσο σημείο.
  const lifted = ([x, y], weight) => [weight * x, weight * y, weight];
  const start = lifted(a, 1 - t);
  return [lifted(b, 1 - s), lifted(d, s)].map(end => end.map((value, i) => value - start[i]));
}

function intersect(a, b) {
  if (a === null || b === null) return null;
  const min = Math.max(a.min, b.min);
  const max = Math.min(a.max, b.max);
  return min <= max && max > 0 ? { min, max } : null;
}

function nonpositive(constant, slope) {
  if (slope > 0) return { min: 0, max: -constant / slope };
  if (slope < 0) return { min: -constant / slope, max: Infinity };
  return constant <= 0 ? { min: 0, max: Infinity } : null;
}

function feasibleFocalSquared([ux, uy, uz], [vx, vy, vz]) {
  // Πρώτος άξονας η μεγάλη πλευρά. Με q = (f / width)², οι δύο στήλες
  // ανά μονάδα μήκους πρέπει να είναι κάθετες και ίσου μήκους.
  const a = (ux * ux + uy * uy) / aspectRatio ** 2;
  const b = vx * vx + vy * vy;
  const az = (uz / aspectRatio) ** 2;
  const bz = vz * vz;
  const crossXY = 2 * (ux * vx + uy * vy) / aspectRatio;
  const crossZ = 2 * uz * vz / aspectRatio;
  const tolerance = CARD_ORDER_LIMITS.metricTolerance;
  const margin = tolerance * (a + b);
  const marginZ = tolerance * (az + bz);

  let range = { min: 0, max: Infinity };
  for (const [constant, slope] of [[a - b, az - bz], [crossXY, crossZ]]) {
    range = intersect(range, nonpositive(constant - margin, slope - marginZ));
    range = intersect(range, nonpositive(-constant - margin, -slope - marginZ));
  }
  return range;
}

export function checkCardOrder(included, focalPx) {
  const width = Math.max(included[0].width, included[0].height);
  let candidates = [{ range: { min: 0, max: Infinity }, shiftedPhotoIds: [] }];
  for (const { photoId, view } of included) {
    const axes = projectiveAxes(view, width);
    if (axes === null) return { ok: false, reason: 'winding', photoId };

    const [first, second] = axes;
    // Η μετατόπιση κατά μία θέση ανταλλάσσει τους άξονες και αλλάζει
    // πρόσημο στον έναν. Το πρόσημο χάνεται στις απόλυτες αποκλίσεις.
    const ranges = [feasibleFocalSquared(first, second), feasibleFocalSquared(second, first)];
    candidates = candidates.flatMap(({ range, shiftedPhotoIds }) =>
      ranges.flatMap((candidateRange, shifted) => {
        const sharedRange = intersect(range, candidateRange);
        if (sharedRange === null) return [];
        return [{
          range: sharedRange,
          shiftedPhotoIds: shifted ? [...shiftedPhotoIds, photoId] : shiftedPhotoIds,
        }];
      }));
  }

  const submitted = candidates.find(({ shiftedPhotoIds }) => shiftedPhotoIds.length === 0);
  const alternatives = candidates.filter(({ shiftedPhotoIds }) => shiftedPhotoIds.length > 0)
    .map(({ shiftedPhotoIds }) => shiftedPhotoIds);
  const q = (focalPx / width) ** 2;
  const focalFits = focalPx === null ? null
    : submitted !== undefined && submitted.range.min <= q && q <= submitted.range.max;
  const submittedFeasible = submitted !== undefined;
  return { ok: submittedFeasible && focalFits !== false && alternatives.length === 0,
    submittedFeasible, focalFits, alternatives };
}
