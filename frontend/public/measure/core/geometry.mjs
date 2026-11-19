// Πειραματικό · γεωμετρία περιγράμματος · WebApp 0.1.0.
export const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const comparePoint = (a, b) => a[0] - b[0] || a[1] - b[1];
export const imageCenter = image => [(image.width_px - 1) / 2, (image.height_px - 1) / 2];
export const midpoint = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const wrapDelta = (to, from) => {
  const delta = to - from;
  return delta <= -Math.PI ? delta + 2 * Math.PI : delta > Math.PI ? delta - 2 * Math.PI : delta;
};

export function inImage(point, image) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
    && point[0] >= 0 && point[0] <= image.width_px - 1
    && point[1] >= 0 && point[1] <= image.height_px - 1;
}

export function areaTwice(points) {
  return points.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    return sum + x * nextY - y * nextX;
  }, 0);
}

export function polygonCenter(points) {
  let area = 0;
  let xSum = 0;
  let ySum = 0;
  points.forEach(([x, y], index) => {
    const [nextX, nextY] = points[(index + 1) % points.length];
    const cross = x * nextY - y * nextX;
    area += cross;
    xSum += (x + nextX) * cross;
    ySum += (y + nextY) * cross;
  });
  return area === 0 ? midpoint(points[0], points.at(-1)) : [xSum / (3 * area), ySum / (3 * area)];
}

export function walk(points, closed = true) {
  const count = closed ? points.length : points.length - 1;
  const cumulative = [0], lengths = [];
  for (let i = 0; i < count; i++) {
    const length = distance(points[i], points[(i + 1) % points.length]);
    lengths.push(length);
    cumulative.push(cumulative[i] + length);
  }
  return { points, cumulative, lengths, length: cumulative.at(-1), closed };
}

const modulo = (x, period) => x < 0 ? (x % period + period) % period : x % period;

function positionAt(path, along) {
  const s = path.closed ? modulo(along, path.length) : clamp(along, 0, path.length);
  let lo = 0;
  let hi = path.lengths.length;
  while (hi - lo > 1) {
    const middle = Math.floor((lo + hi) / 2);
    if (path.cumulative[middle] <= s) lo = middle;
    else hi = middle;
  }
  const snap = 16 * Number.EPSILON * path.length;
  if (s - path.cumulative[lo] <= snap) return { point: path.points[lo], index: lo, inserted: false };
  if (path.cumulative[hi] - s <= snap) {
    const index = hi % path.points.length;
    return { point: path.points[index], index, inserted: false };
  }
  const t = (s - path.cumulative[lo]) / path.lengths[lo];
  const a = path.points[lo], b = path.points[(lo + 1) % path.points.length];
  return { point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], index: lo, inserted: true, t };
}

export function pointAtFraction(points, fraction) {
  const path = walk(points);
  return positionAt(path, fraction * path.length).point;
}

export function project(path, probe) {
  let best;
  let bestSquared = Infinity;
  for (let index = 0; index < path.lengths.length; index++) {
    const start = path.points[index], end = path.points[(index + 1) % path.points.length];
    const reversed = comparePoint(start, end) > 0;
    const [a, b] = reversed ? [end, start] : [start, end];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp(((probe[0] - a[0]) * dx + (probe[1] - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    const point = [a[0] + t * dx, a[1] + t * dy];
    const squared = (probe[0] - point[0]) ** 2 + (probe[1] - point[1]) ** 2;
    if (squared < bestSquared || (squared === bestSquared && comparePoint(point, best.point) < 0)) {
      bestSquared = squared;
      best = { point, index, fraction: (reversed ? 1 - t : t), start, end };
    }
  }
  best.along = path.cumulative[best.index] + best.fraction * path.lengths[best.index];
  return best;
}

export function fractionAtPoint(points, probe) {
  const path = walk(points);
  return project(path, probe).along / path.length;
}

const validFraction = value => Number.isFinite(value) && value >= 0 && value <= 1;

function insertEndpoints(original, start, end) {
  const entries = original.map((point, index) => ({ point, index, inserted: false }));
  const endpoints = [start, end].map(endpoint => endpoint.inserted ? endpoint : entries[endpoint.index]);
  entries.push(...endpoints.filter(endpoint => endpoint.inserted));
  entries.sort((a, b) => a.index - b.index || (a.t ?? 0) - (b.t ?? 0));
  const [first, last] = endpoints.map(endpoint => entries.indexOf(endpoint));
  const count = (last - first + entries.length) % entries.length + 1;
  return {
    points: entries.map(entry => entry.point),
    inserted: entries.flatMap((entry, index) => entry.inserted ? [index] : []),
    indices: Array.from({ length: count }, (_, index) => (first + index) % entries.length),
  };
}

function normalAt(path, anchor) {
  // Στη γωνία χρησιμοποιούμε τη διχοτόμο των γειτονικών εξωτερικών καθέτων.
  const edges = [anchor.index];
  const vertex = anchor.fraction === 0 ? anchor.index
    : anchor.fraction === 1 ? (anchor.index + 1) % path.points.length : null;
  if (vertex !== null) edges.splice(0, 1, (vertex + path.points.length - 1) % path.points.length, vertex);
  const winding = Math.sign(areaTwice(path.points));
  let dx = 0, dy = 0;
  for (const index of edges) {
    const a = path.points[index], b = path.points[(index + 1) % path.points.length];
    dx += (b[0] - a[0]) / path.lengths[index];
    dy += (b[1] - a[1]) / path.lengths[index];
  }
  const magnitude = Math.hypot(dx, dy);
  return winding && magnitude > 1e-12 ? [winding * dy / magnitude, winding * dx / magnitude] : null;
}

export function selectSupport(original, options = { mode: 'full' }) {
  const path = walk(original);
  const { mode, anchorFraction = 0, materialInside = false } = options;
  if (original.length < 5 || !validFraction(anchorFraction) || !(path.length > 0)) return null;
  let anchorProbe = options.anchorProbe ?? positionAt(path, anchorFraction * path.length).point;
  let points = original, inserted = [], indices = original.map((_, i) => i);
  if (mode !== 'full') {
    let start;
    let length;
    if (mode === 'third') {
      length = path.length / 3;
      start = project(path, anchorProbe).along - length / 2;
    } else if (mode === 'arc') {
      const { startFraction, endFraction } = options;
      if (!validFraction(startFraction) || !validFraction(endFraction)) return null;
      start = startFraction * path.length;
      length = modulo(endFraction - startFraction, 1) * path.length;
      if (!(length > 0 && length < path.length)) return null;
      anchorProbe = positionAt(path, start + length / 2).point;
    } else return null;
    ({ points, inserted, indices } = insertEndpoints(original, positionAt(path, start), positionAt(path, start + length)));
    if (indices.length < 5 || indices.length >= points.length) return null;
  }
  const anchor = project(walk(points), anchorProbe);
  return {
    points, inserted, indices, selected: indices.map(index => points[index]), anchorProbe,
    anchor: anchor.point, normal: materialInside ? normalAt(path, project(path, anchorProbe)) : null,
    mode: mode === 'full' ? 'full' : 'arc',
    targetKind: mode === 'full' ? 'whole' : mode === 'third' ? 'third_perimeter' : 'window_mm',
  };
}

export function supportExtents(points, closed) {
  let first, last;
  let diameter = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      let a = points[i], b = points[j];
      const length = distance(a, b);
      if (length < diameter) continue;
      if (comparePoint(a, b) > 0) [a, b] = [b, a];
      if (length > diameter || (comparePoint(a, first) || comparePoint(b, last)) < 0) {
        diameter = length;
        first = a;
        last = b;
      }
    }
  }
  const { length, lengths } = walk(points, closed);
  const [a, b] = closed ? [first, last] : [points[0], points.at(-1)];
  const chord = distance(a, b), dx = b[0] - a[0], dy = b[1] - a[1];
  return {
    endpoint_chord: closed ? 0 : chord,
    polyline_length: length,
    support_diameter: diameter,
    sagitta: Math.max(...points.map(([x, y]) => Math.abs(dx * (y - a[1]) - dy * (x - a[0])) / chord)),
    spacing_min: Math.min(...lengths),
    spacing_mean: length / lengths.length,
    spacing_max: Math.max(...lengths),
  };
}
