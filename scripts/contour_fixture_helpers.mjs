/** Analytic image fixtures specified independently from the detector and CAD.
 * These are synthetic optical controls, not photographs or biological validation.
 */
import { deflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";

export const SHAPES = {
  rounded: [
    [-0.32, -0.48],
    [0, -0.55],
    [0.32, -0.48],
    [0.48, -0.28],
    [0.5, 0.08],
    [0.39, 0.4],
    [0.18, 0.51],
    [0, 0.54],
    [-0.23, 0.49],
    [-0.42, 0.34],
    [-0.51, -0.02],
    [-0.47, -0.3],
  ],
  flatterTip: [
    [-0.4, -0.48],
    [0.36, -0.48],
    [0.48, -0.3],
    [0.5, 0.15],
    [0.37, 0.44],
    [0.13, 0.52],
    [-0.13, 0.52],
    [-0.4, 0.41],
    [-0.49, 0.14],
    [-0.48, -0.3],
  ],
  asymmetric: [
    [-0.21, -0.54],
    [0.19, -0.51],
    [0.42, -0.32],
    [0.5, -0.02],
    [0.43, 0.32],
    [0.19, 0.51],
    [-0.11, 0.55],
    [-0.37, 0.42],
    [-0.51, 0.13],
    [-0.46, -0.26],
  ],
};
export function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export function makeContourFixture(options = {}) {
  const width = options.width ?? 480,
    height = options.height ?? 640;
  const objects = options.objects ?? [
    {
      cx: options.cx ?? 0.5,
      cy: options.cy ?? 0.5,
      w: options.nailWidth ?? 0.34,
      h: options.nailHeight ?? 0.46,
      angle: options.angle ?? 0,
      shape: options.shape ?? "rounded",
    },
  ];
  const skin = options.skin ?? [205, 153, 126],
    plate = options.plate ?? [232, 190, 178];
  const background = options.background ?? [46, 57, 66];
  const noise = options.noise ?? 0,
    rng = random(options.seed ?? 9241);
  const data = new Uint8ClampedArray(width * height * 4),
    truth = new Uint8Array(width * height);
  const transforms = objects.map((o) => {
    const theta = (o.angle * Math.PI) / 180,
      cos = Math.cos(theta),
      sin = Math.sin(theta);
    const polygon = SHAPES[o.shape];
    return {
      ...o,
      cos,
      sin,
      polygon,
      nw: o.w * width,
      nh: o.h * height,
      px: o.cx * width,
      py: o.cy * height,
    };
  });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let color = background,
        isNail = false;
      for (const o of transforms) {
        const dx = x + 0.5 - o.px,
          dy = y + 0.5 - o.py;
        const localX = dx * o.cos + dy * o.sin,
          localY = -dx * o.sin + dy * o.cos;
        const radius = o.nw * 0.78,
          capY = -o.nh * 0.27;
        if (
          (Math.abs(localX) < radius && localY >= capY) ||
          ((localX / radius) ** 2 + ((localY - capY) / radius) ** 2 < 1 &&
            localY < capY)
        )
          color = skin;
        if (
          !options.noNail &&
          insidePolygon(localX / o.nw, localY / o.nh, o.polygon)
        ) {
          color = plate;
          isNail = true;
        }
      }
      const shade =
        (options.lighting ?? 0) *
        ((x / width - 0.5) * 0.6 + (y / height - 0.5) * 0.4);
      const index = y * width + x;
      for (let c = 0; c < 3; c++)
        data[index * 4 + c] = color[c] + shade + (rng() - 0.5) * noise * 2;
      if (
        options.glare &&
        ((x / width - 0.51) / 0.07) ** 2 + ((y / height - 0.48) / 0.1) ** 2 <
          1 &&
        isNail
      ) {
        data[index * 4] = 255;
        data[index * 4 + 1] = 255;
        data[index * 4 + 2] = 255;
      }
      data[index * 4 + 3] = 255;
      truth[index] = isNail ? 1 : 0;
    }
  return { width, height, data, truth, options };
}
export function blurFrame(frame, radius = 18, passes = 3) {
  const { width, height } = frame;
  let data = new Float64Array(frame.data),
    output = new Float64Array(data.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let axis = 0; axis < 2; axis++) {
      const outer = axis ? width : height,
        inner = axis ? height : width;
      for (let line = 0; line < outer; line++)
        for (let c = 0; c < 4; c++) {
          const at = (i) =>
            (axis ? i * width + line : line * width + i) * 4 + c;
          let sum = 0;
          for (let k = -radius; k <= radius; k++)
            sum += data[at(Math.max(0, Math.min(inner - 1, k)))];
          for (let i = 0; i < inner; i++) {
            output[at(i)] = sum / (2 * radius + 1);
            sum +=
              data[at(Math.min(inner - 1, i + radius + 1))] -
              data[at(Math.max(0, i - radius))];
          }
        }
      [data, output] = [output, data];
    }
  }
  return { ...frame, data: new Uint8ClampedArray(data) };
}
export function polygonIoU(frame, polygon) {
  const p = polygon.map((point) => [
    point.x * frame.width,
    point.y * frame.height,
  ]);
  let intersection = 0,
    union = 0;
  for (let y = 0; y < frame.height; y += 2)
    for (let x = 0; x < frame.width; x += 2) {
      const actual = insidePolygon(x + 0.5, y + 0.5, p),
        expected = !!frame.truth[y * frame.width + x];
      if (actual && expected) intersection++;
      if (actual || expected) union++;
    }
  return intersection / union;
}

/** Lossless temporary test image, with no EXIF or personal photographs. */
export async function writeFixturePNG(frame, path) {
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const name = Buffer.from(type),
      prefix = Buffer.alloc(4),
      suffix = Buffer.alloc(4);
    prefix.writeUInt32BE(data.length);
    suffix.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([prefix, name, data, suffix]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(frame.width, 0);
  header.writeUInt32BE(frame.height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((frame.width * 4 + 1) * frame.height);
  const pixels = Buffer.from(
    frame.data.buffer,
    frame.data.byteOffset,
    frame.data.byteLength,
  );
  for (let y = 0; y < frame.height; y++)
    pixels.copy(
      rows,
      y * (frame.width * 4 + 1) + 1,
      y * frame.width * 4,
      (y + 1) * frame.width * 4,
    );
  await writeFile(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
