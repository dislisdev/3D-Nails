// Πειραματικό · επιλογή με άγγιγμα · WebApp 0.2.0.
import { centroid, fillHoles, orderAround, refineFromMask, seedRegions } from './contour_core.mjs';
import { areaTwice, distance, pointInOutline, polygonCenter, uniformContour } from './geometry.mjs';
import { findObjects } from './image.mjs';

const COARSE_SIDE = 1600;
const BAND = 14;
const CORE = 4;

function reduceGray({ gray, width, height }) {
  const ratio = Math.min(1, COARSE_SIDE / Math.max(width, height));
  if (ratio === 1) return { gray, width, height, ratio };
  const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
  const reduced = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const top = Math.floor(y * height / h), bottom = Math.floor((y + 1) * height / h);
    for (let x = 0; x < w; x++) {
      const left = Math.floor(x * width / w), right = Math.floor((x + 1) * width / w);
      let sum = 0;
      for (let yy = top; yy < bottom; yy++) {
        for (let xx = left; xx < right; xx++) sum += gray[yy * width + xx];
      }
      reduced[y * w + x] = Math.round(sum / ((right - left) * (bottom - top)));
    }
  }
  return { gray: reduced, width: w, height: h, ratio };
}

// Εδώ συνδέεται η τεχνική επιλογής περιοχής. Οι μάσκες εξάγονται κατά ζήτηση.
export function findSeedMasks(image, seed) {
  const { gray, width, height } = image;
  const result = seedRegions(gray, width, height, seed);
  if (!result.ok) return result;
  return {
    ok: true,
    candidates: result.candidates.map(({ area }) => ({ area })),
    maskAt(index) {
      return fillHoles(result.maskAt(result.candidates[index].tolerance), width, height).mask;
    },
  };
}

// Μεγαλώνουμε τη μάσκα στην κλίμακα της μέτρησης. Για να περιορίσουμε τη μνήμη,
// κρατάμε την περιοχή της μάσκας και όλη τη ζώνη που διαβάζει το refineFromMask.
function cropForRefinement(image, coarse, mask) {
  const sx = image.width / coarse.width, sy = image.height / coarse.height;
  const band = Math.ceil(BAND * Math.max(sx, sy)), core = Math.ceil(CORE * Math.max(sx, sy));
  let minX = coarse.width, minY = coarse.height, maxX = 0, maxY = 0;
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    const x = index % coarse.width, y = Math.floor(index / coarse.width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const left = Math.max(0, Math.floor(minX * sx) - band - 2);
  const top = Math.max(0, Math.floor(minY * sy) - band - 2);
  const right = Math.min(image.width, Math.ceil((maxX + 1) * sx) + band + 2);
  const bottom = Math.min(image.height, Math.ceil((maxY + 1) * sy) + band + 2);
  const width = right - left, height = bottom - top;
  const gray = new Uint8Array(width * height), enlarged = new Uint8Array(gray.length);
  for (let y = 0; y < height; y++) {
    const row = (y + top) * image.width + left;
    gray.set(image.gray.subarray(row, row + width), y * width);
    const maskRow = Math.floor((y + top + 0.5) / sy) * coarse.width;
    for (let x = 0; x < width; x++) enlarged[y * width + x] = mask[maskRow + Math.floor((x + left + 0.5) / sx)];
  }
  return { gray, width, height, mask: enlarged, left, top, band, core };
}

const refused = reason => ({ ok: false, reason });

function makeRegion(raw, image, seed, area) {
  // Ο κώδικας του εργαστηρίου χρησιμοποιεί κέντρα pixel σε i + 0,5.
  const points = raw.map(([x, y]) => [x - 0.5, y - 0.5]);
  if (points.length < 8 || points.some(([x, y]) => x <= 0 || y <= 0 || x >= image.width - 1 || y >= image.height - 1)) {
    return refused('Το περίγραμμα είναι πολύ μικρό ή φτάνει στην άκρη της εικόνας.');
  }
  const ordered = orderAround(points, centroid(points));
  const distinct = ordered.filter((point, i) => distance(point, ordered[(i + 1) % ordered.length]) > 1e-8);
  // Για πολύ κοίλα σχήματα η γωνιακή σειρά μπορεί να συνδέσει χωριστές ακμές.
  if (distinct.length < 8 || distinct.some((point, i) => distance(point, distinct[(i + 1) % distinct.length]) > 4)) {
    return refused('Τα σημεία της ακμής δεν σχηματίζουν συνεχές περίγραμμα.');
  }
  const polygon = uniformContour(areaTwice(distinct) < 0 ? distinct.reverse() : distinct);
  return { ok: true, region: { points: polygon, center: polygonCenter(polygon), seed, size: area } };
}

export function createContourSession(gray, width, height) {
  const image = { gray, width, height };
  let coarse;
  let selection;
  return {
    at(seed, { index, threshold } = {}) {
      if (threshold !== undefined) {
        const region = findObjects(gray, width, height, threshold).find(item => pointInOutline(item.points, seed));
        return region ? { ok: true, region: { ...region, seed }, index: 0, candidates: [{ area: region.size }] }
          : refused('Κανένα περίγραμμα στο σημείο με αυτό το κατώφλι. Δοκίμασε άλλη τιμή ή την αυτόματη επιλογή.');
      }
      // Οι εναλλακτικές του ίδιου αγγίγματος επαναχρησιμοποιούν την εύρεση περιοχής.
      if (!selection || selection.seed[0] !== seed[0] || selection.seed[1] !== seed[1]) {
        coarse ??= reduceGray(image);
        const touch = [(seed[0] + 0.5) * coarse.width / width, (seed[1] + 0.5) * coarse.height / height];
        selection = { seed, masks: findSeedMasks(coarse, touch) };
      }
      const { masks } = selection;
      if (!masks.ok) return masks;
      const chosen = index ?? 0, candidate = masks.candidates[chosen];
      if (!candidate) return refused('Η εναλλακτική περιοχή δεν είναι διαθέσιμη.');
      const crop = cropForRefinement(image, coarse, masks.maskAt(chosen));
      const touch = [seed[0] + 0.5 - crop.left, seed[1] + 0.5 - crop.top];
      const edge = refineFromMask(crop.gray, crop.width, crop.height, crop.mask, touch, { band: crop.band, core: crop.core });
      const result = edge.ok
        ? makeRegion(edge.points.map(([x, y]) => [x + crop.left, y + crop.top]), image, seed, edge.area)
        : edge;
      return { ...result, index: chosen, candidates: masks.candidates };
    },
  };
}

export function alternativeIndex(selection, direction) {
  const area = selection.candidates[selection.index].area;
  const areas = selection.candidates.map(candidate => (candidate.area - area) * direction);
  return areas.reduce((best, value, i) => value > 0 && (best === -1 || value < areas[best]) ? i : best, -1);
}
