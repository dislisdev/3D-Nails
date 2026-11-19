// Πειραματικό · εκτίμηση ορίου με παρεμβολή στο κατώφλι · WebApp 0.2.0.
import { areaTwice, polygonCenter, uniformContour } from './geometry.mjs';

export const MAX_PIXELS = 16_000_000;
const MIN_AREA = 9;
const MAX_REGIONS = 24;

export function grayscale(rgba, width, height) {
  const count = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > 100_000 || height > 100_000 || count > MAX_PIXELS || rgba.length !== count * 4) {
    throw new RangeError('Μη αποδεκτές διαστάσεις εικόνας.');
  }
  const pixels = new Uint8Array(count);
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    const light = (2126 * rgba[p] + 7152 * rgba[p + 1] + 722 * rgba[p + 2]) / 10_000;
    pixels[i] = Math.round(255 - (255 - light) * (rgba[p + 3] / 255));
  }
  return pixels;
}

export function defaultThreshold(gray) {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[value]++;
  const total = histogram.reduce((acc, bin, value) => acc + bin * value, 0);
  let count = 0, sum = 0;
  let best = -1, first = 127, last = 127;
  for (let threshold = 0; threshold < 255; threshold++) {
    count += histogram[threshold];
    sum += histogram[threshold] * threshold;
    if (count === 0 || count === gray.length) continue;
    const remaining = gray.length - count;
    const score = count * remaining * (sum / count - (total - sum) / remaining) ** 2;
    if (score > best) {
      best = score;
      first = threshold;
      last = threshold;
    } else if (score === best) last = threshold;
  }
  return Math.min(254, Math.max(0, Math.round((first + last) / 2)));
}

function labelRegions(gray, width, height, threshold) {
  const labels = new Int32Array(gray.length);
  const queue = new Int32Array(gray.length);
  const found = [];
  let label = 0;
  for (let seed = 0; seed < gray.length; seed++) {
    if (labels[seed] || gray[seed] > threshold) continue;
    labels[seed] = ++label;
    queue[0] = seed;
    let size = 1;
    let xMin = seed % width, xMax = xMin;
    let yMin = Math.floor(seed / width), yMax = yMin;
    const visit = index => {
      if (labels[index] === 0 && gray[index] <= threshold) {
        labels[index] = label;
        queue[size++] = index;
      }
    };
    for (let head = 0; head < size; head++) {
      const index = queue[head], x = index % width, y = Math.floor(index / width);
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y);
      yMax = Math.max(yMax, y);
      if (x > 0) visit(index - 1);
      if (x + 1 < width) visit(index + 1);
      if (y > 0) visit(index - width);
      if (y + 1 < height) visit(index + width);
    }
    if (size >= MIN_AREA && xMin > 0 && yMin > 0 && xMax < width - 1 && yMax < height - 1) {
      found.push({ id: seed, label, size, bounds: [xMin, yMin, xMax, yMax] });
    }
  }
  found.sort((a, b) => b.size - a.size || a.id - b.id);
  return { labels, regions: found.slice(0, MAX_REGIONS) };
}

// Ακμές κελιού κατά σειρά πάνω, δεξιά, κάτω, αριστερά. Οι διαγώνιες
// ισοπαλίες κρατούν χωριστές τις σκούρες γωνίες, όπως στην 4-σύνδεση.
const SEGMENTS = [
  [], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2],
  [2, 3], [2, 0], [0, 1, 2, 3], [1, 2], [1, 3], [0, 1], [3, 0], [],
];

function boundary(gray, labels, width, region, iso) {
  const links = new Map();
  const connect = (a, b) => {
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    links.get(a).push(b);
    links.get(b).push(a);
  };
  const [xMin, yMin, xMax, yMax] = region.bounds;
  for (let y = yMin - 1; y <= yMax; y++) {
    for (let x = xMin - 1; x <= xMax; x++) {
      const i = y * width + x;
      const mask = (labels[i] === region.label ? 1 : 0)
        | (labels[i + 1] === region.label ? 2 : 0)
        | (labels[i + width + 1] === region.label ? 4 : 0)
        | (labels[i + width] === region.label ? 8 : 0);
      const segments = SEGMENTS[mask];
      if (segments.length === 0) continue;
      const edges = [2 * i, 2 * (i + 1) + 1, 2 * (i + width), 2 * i + 1];
      for (let j = 0; j < segments.length; j += 2) connect(edges[segments[j]], edges[segments[j + 1]]);
    }
  }
  const intersection = edge => {
    const vertical = edge % 2;
    const a = Math.floor(edge / 2), b = a + (vertical ? width : 1);
    const t = (iso - gray[a]) / (gray[b] - gray[a]);
    return [a % width + (vertical ? 0 : t), Math.floor(a / width) + (vertical ? t : 0)];
  };
  const visited = new Set();
  let outer = [], largest = 0;
  for (const edge of links.keys()) {
    if (visited.has(edge)) continue;
    const loop = [];
    let previous = null, current = edge;
    while (!visited.has(current) && links.get(current)?.length === 2) {
      visited.add(current);
      loop.push(intersection(current));
      const [first, last] = links.get(current);
      [previous, current] = [current, first === previous ? last : first];
    }
    if (current !== edge || loop.length < 5) continue;
    const area = areaTwice(loop);
    if (Math.abs(area) > largest) {
      largest = Math.abs(area);
      // Διατηρούμε σταθερή ραφή και δεξιόστροφη φορά στην εικόνα.
      outer = area >= 0 ? loop : [loop[0], ...loop.slice(1).reverse()];
    }
  }
  return uniformContour(outer);
}

export function findObjects(gray, width, height, threshold) {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 254 || gray.length !== width * height) {
    throw new RangeError('Άκυρο κατώφλι εικόνας.');
  }
  const { labels, regions } = labelRegions(gray, width, height, threshold);
  return regions.flatMap(region => {
    const points = boundary(gray, labels, width, region, threshold + 0.5);
    return points.length ? [{ ...region, points, center: polygonCenter(points) }] : [];
  });
}
