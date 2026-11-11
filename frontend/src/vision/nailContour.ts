/**
 * Experimental image-derived contour proposals for one centred, high-contrast
 * nail plate. This is a colour-region/edge heuristic, not anatomical recognition.
 * It can select another similarly shaped region and often abstains on unpolished
 * nails whose colour is close to the surrounding skin. Human review is required.
 * No network requests, physical scale, curvature or accuracy estimates are used.
 */
export type TipDirection = "up" | "down";
export type NormalizedPoint = { x: number; y: number };
export type DetectionResult =
  | {
      status: "candidate";
      points: NormalizedPoint[];
      outline: NormalizedPoint[];
      method: "contrast_outline_v1";
      diagnostics: Record<string, number | string>;
    }
  | { status: "unavailable"; reason: string; method: "contrast_outline_v1" };

type Frame = { width: number; height: number; data: Uint8ClampedArray };
type Point = { x: number; y: number };
type Region = {
  mask: Uint8Array;
  pixels: number[];
  outline: Point[];
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  support: number;
  contrast: number;
  score: number;
  threshold: number;
};
type Group = { best: Region; members: Region[]; agreement: number };

const METHOD = "contrast_outline_v1" as const;
const REASON = {
  frame: "A valid camera frame is not available yet.",
  contrast: "Image contrast is too low to propose an outline.",
  detail: "Image detail is too low; hold still and refocus.",
  missing:
    "No single supported nail boundary was found. Adjust lighting or use manual mode.",
  ambiguous:
    "More than one possible nail region is visible. Centre one nail or use manual mode.",
  clipped:
    "The candidate touches the image edge. Keep the whole nail inside the frame.",
  glare:
    "Glare hides part of the candidate. Change the lighting or use manual mode.",
  contour:
    "Automatic outline could not form a usable contour. Use manual mode.",
  direction:
    "The nail direction is unclear. Align the fingertip with the selected direction or use manual mode.",
};

function unavailable(reason: string): DetectionResult {
  return { status: "unavailable", reason, method: METHOD };
}

/** Bounded, orientation-preserving sample grid; pixel cells map to source cells. */
function sample(frame: Frame) {
  const scale = Math.min(1, 224 / Math.max(frame.width, frame.height));
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const colors = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const sy = Math.max(
      0,
      Math.min(frame.height - 1, ((y + 0.5) * frame.height) / height - 0.5),
    );
    const y0 = Math.floor(sy),
      y1 = Math.min(frame.height - 1, y0 + 1),
      fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(
        0,
        Math.min(frame.width - 1, ((x + 0.5) * frame.width) / width - 0.5),
      );
      const x0 = Math.floor(sx),
        x1 = Math.min(frame.width - 1, x0 + 1),
        fx = sx - x0;
      const a = (y0 * frame.width + x0) * 4,
        b = (y0 * frame.width + x1) * 4;
      const c = (y1 * frame.width + x0) * 4,
        d = (y1 * frame.width + x1) * 4;
      for (let channel = 0; channel < 3; channel++) {
        colors[(y * width + x) * 3 + channel] =
          (frame.data[a + channel] * (1 - fx) + frame.data[b + channel] * fx) *
            (1 - fy) +
          (frame.data[c + channel] * (1 - fx) + frame.data[d + channel] * fx) *
            fy;
      }
    }
  }
  return { width, height, colors };
}

function quality(colors: Float32Array, width: number, height: number) {
  const sums = [0, 0, 0],
    squares = [0, 0, 0];
  let count = 0,
    laplacian = 0;
  for (let y = 2; y < height - 2; y++)
    for (let x = 2; x < width - 2; x++) {
      // Central association prior is a framing aid, not a physical calibration.
      if (
        x < width * 0.12 ||
        x > width * 0.88 ||
        y < height * 0.12 ||
        y > height * 0.88
      )
        continue;
      const index = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const value = colors[index + c];
        sums[c] += value;
        squares[c] += value * value;
        const lap =
          colors[index - 3 + c] +
          colors[index + 3 + c] +
          colors[index - width * 3 + c] +
          colors[index + width * 3 + c] -
          4 * value;
        laplacian += lap * lap;
      }
      count++;
    }
  return {
    colorVariance: Math.max(
      ...squares.map((sum, c) => sum / count - (sums[c] / count) ** 2),
    ),
    laplacian: laplacian / (3 * count),
  };
}

function smooth(colors: Float32Array, width: number, height: number) {
  const horizontal = new Float32Array(colors.length),
    output = new Float32Array(colors.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3,
        left = (y * width + Math.max(0, x - 1)) * 3;
      const right = (y * width + Math.min(width - 1, x + 1)) * 3;
      for (let c = 0; c < 3; c++)
        horizontal[at + c] =
          (colors[left + c] + 2 * colors[at + c] + colors[right + c]) / 4;
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3,
        above = (Math.max(0, y - 1) * width + x) * 3;
      const below = (Math.min(height - 1, y + 1) * width + x) * 3;
      for (let c = 0; c < 3; c++)
        output[at + c] =
          (horizontal[above + c] +
            2 * horizontal[at + c] +
            horizontal[below + c]) /
          4;
    }
  return output;
}

function polygonArea(points: Point[]) {
  return Math.abs(
    points.reduce((sum, p, i) => {
      const next = points[(i + 1) % points.length];
      return sum + p.x * next.y - p.y * next.x;
    }, 0) / 2,
  );
}

/** Trace the actual union-of-pixels boundary, not an ellipse or fitted template. */
function trace(
  mask: Uint8Array,
  pixels: number[],
  width: number,
  height: number,
) {
  const stride = width + 1;
  const outgoing = new Map<number, number[]>();
  let start = Infinity;
  const edge = (from: number, to: number) => {
    const values = outgoing.get(from) ?? [];
    values.push(to);
    outgoing.set(from, values);
    start = Math.min(start, from);
  };
  for (const index of pixels) {
    const x = index % width,
      y = Math.floor(index / width),
      corner = y * stride + x;
    if (y === 0 || !mask[index - width]) edge(corner, corner + 1);
    if (x === width - 1 || !mask[index + 1])
      edge(corner + 1, corner + 1 + stride);
    if (y === height - 1 || !mask[index + width])
      edge(corner + 1 + stride, corner + stride);
    if (x === 0 || !mask[index - 1]) edge(corner + stride, corner);
  }
  const direction = (from: number, to: number) =>
    to === from + 1 ? 0 : to === from + stride ? 1 : to === from - 1 ? 2 : 3;
  const points: Point[] = [],
    visited = new Set<number>();
  let current = start,
    previousDirection = 0;
  while (points.length <= outgoing.size + 1) {
    if (visited.has(current)) return current === start ? points : [];
    visited.add(current);
    points.push({ x: current % stride, y: Math.floor(current / stride) });
    const options = outgoing.get(current);
    if (!options?.length) return [];
    const priorities = [1, 0, 3, 2];
    const next = options.reduce((best, to) => {
      const turn = (direction(current, to) - previousDirection + 4) % 4;
      const bestTurn = (direction(current, best) - previousDirection + 4) % 4;
      return priorities.indexOf(turn) < priorities.indexOf(bestTurn)
        ? to
        : best;
    });
    previousDirection = direction(current, next);
    current = next;
  }
  return [];
}

function rmsDifference(colors: Float32Array, a: number, b: number) {
  let sum = 0;
  for (let c = 0; c < 3; c++)
    sum += (colors[a * 3 + c] - colors[b * 3 + c]) ** 2;
  return Math.sqrt(sum / 3);
}

function edgeSupport(
  mask: Uint8Array,
  pixels: number[],
  colors: Float32Array,
  width: number,
  height: number,
) {
  let supported = 0,
    count = 0,
    contrast = 0;
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const index of pixels) {
    const x = index % width,
      y = Math.floor(index / width);
    for (const [dx, dy] of directions) {
      const nx = x + dx,
        ny = y + dy;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= width ||
        ny >= height ||
        mask[ny * width + nx]
      )
        continue;
      const ix = x - dx * 2,
        iy = y - dy * 2,
        ox = x + dx * 3,
        oy = y + dy * 3;
      if (
        ix < 0 ||
        iy < 0 ||
        ox < 0 ||
        oy < 0 ||
        ix >= width ||
        ox >= width ||
        iy >= height ||
        oy >= height
      )
        continue;
      const difference = rmsDifference(
        colors,
        iy * width + ix,
        oy * width + ox,
      );
      contrast += difference;
      if (difference >= 12) supported++;
      count++;
    }
  }
  return {
    support: count ? supported / count : 0,
    contrast: count ? contrast / count : 0,
  };
}

function overlap(a: Region, b: Region) {
  if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY)
    return 0;
  const smaller = a.pixels.length <= b.pixels.length ? a : b;
  const other = smaller === a ? b : a;
  let intersection = 0;
  for (const index of smaller.pixels) if (other.mask[index]) intersection++;
  return intersection / (a.pixels.length + b.pixels.length - intersection);
}

function axis(region: Region, width: number, tip: TipDirection) {
  let xx = 0,
    yy = 0,
    xy = 0;
  for (const index of region.pixels) {
    const x = (index % width) + 0.5 - region.cx,
      y = Math.floor(index / width) + 0.5 - region.cy;
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const spread = Math.hypot(xx - yy, 2 * xy);
  const ratio = Math.sqrt(
    (xx + yy + spread) / Math.max(1e-8, xx + yy - spread),
  );
  let along =
    ratio < 1.15 ? { x: 0, y: 1 } : { x: Math.cos(angle), y: Math.sin(angle) };
  if ((tip === "up" && along.y > 0) || (tip === "down" && along.y < 0))
    along = { x: -along.x, y: -along.y };
  return { along, ratio };
}

function controlPoints(
  region: Region,
  width: number,
  height: number,
  tip: TipDirection,
) {
  const { along, ratio } = axis(region, width, tip);
  if (Math.abs(along.y) < 0.6 || ratio > 2.8) return null;
  const across = { x: along.y, y: -along.x };
  const local = region.outline.map((p) => ({
    x: (p.x - region.cx) * across.x + (p.y - region.cy) * across.y,
    y: (p.x - region.cx) * along.x + (p.y - region.cy) * along.y,
  }));
  const min = Math.min(...local.map((p) => p.y)),
    max = Math.max(...local.map((p) => p.y));
  if (max - min < 12) return null;
  const extreme = (station: number) => {
    const values = local.filter((p) => Math.abs(p.y - station) < 1e-6);
    return {
      x: values.reduce((sum, p) => sum + p.x, 0) / values.length,
      y: station,
    };
  };
  const sections: { right: Point; left: Point }[] = [];
  for (const t of [0.08, 0.25, 0.5, 0.75, 0.92]) {
    const station = min + t * (max - min),
      intersections: number[] = [];
    local.forEach((a, i) => {
      const b = local[(i + 1) % local.length];
      if (
        (a.y <= station && station < b.y) ||
        (b.y <= station && station < a.y)
      )
        intersections.push(a.x + ((station - a.y) * (b.x - a.x)) / (b.y - a.y));
    });
    intersections.sort((a, b) => a - b);
    const unique = intersections.filter(
      (value, index) =>
        !index || Math.abs(value - intersections[index - 1]) > 1e-5,
    );
    // Rotated pixel cells can produce subpixel gaps along an oblique section.
    // Merge only gaps up to 1.25 analysis pixels; larger missing regions cause
    // abstention rather than a convex hull bridging an unsupported contour.
    if (unique.length < 2 || unique.length % 2) return null;
    let right = unique[1];
    for (let i = 2; i < unique.length; i += 2) {
      if (unique[i] - right > 1.25) return null;
      right = unique[i + 1];
    }
    if (right - unique[0] < 3) return null;
    sections.push({
      left: { x: unique[0], y: station },
      right: { x: right, y: station },
    });
  }
  const shape = [
    extreme(min),
    ...sections.map((s) => s.right),
    extreme(max),
    ...sections
      .slice()
      .reverse()
      .map((s) => s.left),
  ];
  const points = shape.map((p) => ({
    x: (region.cx + p.x * across.x + p.y * along.x) / width,
    y: (region.cy + p.x * across.y + p.y * along.y) / height,
  }));
  if (
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x <= 0 ||
        p.y <= 0 ||
        p.x >= 1 ||
        p.y >= 1,
    )
  )
    return null;
  const polygon = points.map((p) => ({ x: p.x * width, y: p.y * height }));
  if (polygonArea(polygon) < region.pixels.length * 0.72) return null;
  const a = polygon[0],
    b = polygon[6],
    length = Math.hypot(b.x - a.x, b.y - a.y);
  const rightSide = (p: Point) =>
    ((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / length;
  if (rightSide(polygon[3]) <= 1 || rightSide(polygon[9]) >= -1) return null;
  return {
    points,
    angle: (Math.acos(Math.min(1, Math.abs(along.y))) * 180) / Math.PI,
  };
}

/** Stateless detector: callers must clear old overlays whenever it abstains. */
export function detectNailContour(
  frame: Frame,
  options: { tipDirection?: TipDirection } = {},
): DetectionResult {
  if (
    !Number.isInteger(frame.width) ||
    !Number.isInteger(frame.height) ||
    Math.min(frame.width, frame.height) < 48 ||
    !(frame.data instanceof Uint8ClampedArray) ||
    frame.data.length < frame.width * frame.height * 4
  )
    return unavailable(REASON.frame);
  const tip = options.tipDirection ?? "up";
  if (tip !== "up" && tip !== "down") return unavailable(REASON.direction);
  const { width, height, colors: raw } = sample(frame);
  const detail = quality(raw, width, height);
  if (!Number.isFinite(detail.colorVariance) || detail.colorVariance < 40)
    return unavailable(REASON.contrast);
  if (!Number.isFinite(detail.laplacian) || detail.laplacian < 5)
    return unavailable(REASON.detail);
  const colors = smooth(raw, width, height),
    total = width * height;
  const queue = new Uint32Array(total),
    groups: Group[] = [];
  const thresholds = [9, 15, 23, 35];
  let clipped = false,
    glare = false;
  const seeds = [
    [0.5, 0.34],
    [0.34, 0.5],
    [0.5, 0.5],
    [0.66, 0.5],
    [0.5, 0.66],
  ];
  for (const [fx, fy] of seeds) {
    const sx = Math.min(width - 2, Math.max(1, Math.round(width * fx))),
      sy = Math.min(height - 2, Math.max(1, Math.round(height * fy)));
    const seed = sy * width + sx,
      seedColor = [0, 0, 0];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (let c = 0; c < 3; c++)
          seedColor[c] += colors[((sy + dy) * width + sx + dx) * 3 + c] / 9;
    const distances = new Float32Array(total);
    for (let i = 0; i < total; i++)
      distances[i] =
        ((colors[i * 3] - seedColor[0]) ** 2 +
          (colors[i * 3 + 1] - seedColor[1]) ** 2 +
          (colors[i * 3 + 2] - seedColor[2]) ** 2) /
        3;
    for (let threshold = 0; threshold < thresholds.length; threshold++) {
      const limit = thresholds[threshold] ** 2;
      if (distances[seed] > limit) continue;
      const mask = new Uint8Array(total);
      let head = 0,
        tail = 1,
        minX = sx,
        maxX = sx,
        minY = sy,
        maxY = sy,
        sumX = 0,
        sumY = 0;
      queue[0] = seed;
      mask[seed] = 1;
      while (head < tail && tail <= total * 0.38) {
        const index = queue[head++],
          x = index % width,
          y = Math.floor(index / width);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        sumX += x + 0.5;
        sumY += y + 0.5;
        if (x > 0 && !mask[index - 1] && distances[index - 1] <= limit) {
          mask[index - 1] = 1;
          queue[tail++] = index - 1;
        }
        if (
          x < width - 1 &&
          !mask[index + 1] &&
          distances[index + 1] <= limit
        ) {
          mask[index + 1] = 1;
          queue[tail++] = index + 1;
        }
        if (
          y > 0 &&
          !mask[index - width] &&
          distances[index - width] <= limit
        ) {
          mask[index - width] = 1;
          queue[tail++] = index - width;
        }
        if (
          y < height - 1 &&
          !mask[index + width] &&
          distances[index + width] <= limit
        ) {
          mask[index + width] = 1;
          queue[tail++] = index + width;
        }
      }
      if (head < tail || tail < total * 0.018 || tail > total * 0.38) continue;
      if (minX < 3 || minY < 3 || maxX >= width - 3 || maxY >= height - 3) {
        clipped = true;
        continue;
      }
      const cx = sumX / tail,
        cy = sumY / tail,
        distance = Math.hypot(cx / width - 0.5, cy / height - 0.5);
      if (distance > 0.31) continue;
      const boxArea = (maxX - minX + 1) * (maxY - minY + 1),
        fill = tail / boxArea;
      if (fill < 0.52 || Math.min(maxX - minX, maxY - minY) < 10) continue;
      const pixels = Array.from(queue.subarray(0, tail));
      let nearWhite = 0;
      for (const index of pixels)
        if (
          raw[index * 3] >= 245 &&
          raw[index * 3 + 1] >= 245 &&
          raw[index * 3 + 2] >= 245
        )
          nearWhite++;
      if (nearWhite / pixels.length > 0.4) {
        glare = true;
        continue;
      }
      const outline = trace(mask, pixels, width, height);
      if (
        outline.length < 24 ||
        Math.abs(polygonArea(outline) - tail) > tail * 0.025
      )
        continue;
      const support = edgeSupport(mask, pixels, colors, width, height);
      if (support.support < 0.68 || support.contrast < 14) continue;
      const region: Region = {
        mask,
        pixels,
        outline,
        cx,
        cy,
        minX,
        maxX,
        minY,
        maxY,
        ...support,
        score: support.support + 0.15 * fill - 0.85 * distance,
        threshold,
      };
      const existing = groups.find(
        (group) => overlap(group.best, region) >= 0.82,
      );
      if (existing) {
        for (const member of existing.members)
          if (Math.abs(member.threshold - threshold) === 1)
            existing.agreement = Math.max(
              existing.agreement,
              overlap(member, region),
            );
        existing.members.push(region);
        if (region.score > existing.best.score) existing.best = region;
      } else groups.push({ best: region, members: [region], agreement: 0 });
    }
  }
  const supported = groups
    .filter((group) => group.agreement >= 0.88)
    .sort((a, b) => b.best.score - a.best.score);
  if (!supported.length)
    return unavailable(
      glare ? REASON.glare : clipped ? REASON.clipped : REASON.missing,
    );
  const first = supported[0],
    second = supported[1];
  if (
    second &&
    second.best.score >= first.best.score * 0.82 &&
    second.best.pixels.length >= first.best.pixels.length * 0.4
  )
    return unavailable(REASON.ambiguous);
  const controls = controlPoints(first.best, width, height, tip);
  if (!controls) {
    const direction = axis(first.best, width, tip);
    return unavailable(
      Math.abs(direction.along.y) < 0.6 ? REASON.direction : REASON.contour,
    );
  }
  const stride = Math.max(1, Math.ceil(first.best.outline.length / 240));
  const outline = first.best.outline
    .filter((_, index) => index % stride === 0)
    .map((p) => ({ x: p.x / width, y: p.y / height }));
  return {
    status: "candidate",
    points: controls.points,
    outline,
    method: METHOD,
    diagnostics: {
      source_width: frame.width,
      source_height: frame.height,
      analysis_width: width,
      analysis_height: height,
      region_area_fraction: first.best.pixels.length / total,
      boundary_support_ratio: first.best.support,
      boundary_contrast_rgb_rms: first.best.contrast,
      adjacent_threshold_agreement_iou: first.agreement,
      supported_threshold_count: new Set(
        first.members.map((member) => member.threshold),
      ).size,
      axis_degrees_from_vertical: controls.angle,
      semantic_identity: "unverified_colour_region_human_review_required",
      tip_direction: tip,
    },
  };
}
