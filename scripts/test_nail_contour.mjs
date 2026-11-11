#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  makeContourFixture,
  blurFrame,
  polygonIoU,
  writeFixturePNG,
} from "./contour_fixture_helpers.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(join(root, "frontend/package.json"));
const esbuild = require("esbuild");
const output = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "nailform-contour-algorithm-"));
await mkdir(output, { recursive: true });
await esbuild.build({
  entryPoints: [join(root, "frontend/src/vision/nailContour.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: join(output, "detector.mjs"),
});
await esbuild.build({
  entryPoints: [join(root, "frontend/src/browser/measurement.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: join(output, "measurement.mjs"),
});
const { detectNailContour } = await import(
  pathToFileURL(join(output, "detector.mjs"))
);
const { measurePolygon } = await import(
  pathToFileURL(join(output, "measurement.mjs"))
);
const positive = [
  ["rounded-light", {}],
  [
    "medium-tone-flat-tip",
    {
      skin: [168, 113, 89],
      plate: [204, 160, 148],
      shape: "flatterTip",
      lighting: 16,
    },
  ],
  [
    "dark-tone-asymmetric",
    {
      skin: [91, 59, 43],
      plate: [153, 111, 100],
      shape: "asymmetric",
      noise: 5,
    },
  ],
  ["translated-left", { cx: 0.42, cy: 0.46 }],
  ["translated-right", { cx: 0.58, cy: 0.54, shape: "asymmetric" }],
  ["rotated-clockwise", { angle: 23, lighting: 12 }],
  ["rotated-counterclockwise", { angle: -19, noise: 7 }],
  ["landscape", { width: 640, height: 480, nailWidth: 0.28, nailHeight: 0.46 }],
  ["tip-down", { angle: 180, tipDirection: "down", shape: "flatterTip" }],
];
let passed = 0;
const measurements = [];
for (const [name, options] of positive) {
  const fixture = makeContourFixture(options);
  const start = performance.now();
  const result = detectNailContour(fixture, {
    tipDirection: options.tipDirection ?? "up",
  });
  const milliseconds = performance.now() - start;
  assert.equal(result.status, "candidate", `${name}: ${result.reason}`);
  assert.equal(result.points.length, 12);
  assert(result.outline.length > 24);
  assert(result.points.every((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1));
  const sourcePoints = result.points.map((p) => ({
    x: p.x * fixture.width,
    y: p.y * fixture.height,
  }));
  const a = sourcePoints[0],
    b = sourcePoints[6];
  assert((options.tipDirection === "down" ? 1 : -1) * (b.y - a.y) > 0);
  const side = (p) => (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
  assert(
    side(sourcePoints[3]) > 0 && side(sourcePoints[9]) < 0,
    `${name}: landmark order`,
  );
  // Existing measurement validation independently rejects crossed/degenerate
  // polygons and incorrect landmark ordering. The virtual calibration below is
  // an optical fixture scale, not a physical device or nail accuracy claim.
  const measurement = measurePolygon(
    {
      image_id: "optical-fixture",
      contour: sourcePoints,
      calibration: {
        a: { x: 10, y: 10 },
        b: { x: 110, y: 10 },
        reference_mm: 10,
      },
    },
    fixture.width,
    fixture.height,
  );
  assert(measurement.length_mm > 0 && measurement.width_mm > 0);
  const iou = polygonIoU(fixture, result.outline),
    controlIoU = polygonIoU(fixture, result.points);
  assert(iou > 0.9, `${name}: segmented boundary IoU ${iou}`);
  assert(controlIoU > 0.83, `${name}: twelve-point polygon IoU ${controlIoU}`);
  measurements.push({
    name,
    milliseconds,
    segmented_iou: iou,
    twelve_point_iou: controlIoU,
  });
  await writeFixturePNG(fixture, join(output, `${name}.png`));
  console.log(
    `PASS ${name}: segmented IoU=${iou.toFixed(3)}, 12-point IoU=${controlIoU.toFixed(3)}, ${milliseconds.toFixed(1)}ms`,
  );
  passed++;
}
const uniform = {
  width: 320,
  height: 240,
  data: new Uint8ClampedArray(320 * 240 * 4),
};
for (let i = 0; i < uniform.data.length; i += 4) {
  uniform.data[i] = 156;
  uniform.data[i + 1] = 124;
  uniform.data[i + 2] = 108;
  uniform.data[i + 3] = 255;
}
const negative = [
  ["uniform", uniform],
  ["no-plate-finger", makeContourFixture({ noNail: true })],
  ["near-skin-colour", makeContourFixture({ plate: [211, 159, 133] })],
  [
    "noisy-uniform",
    makeContourFixture({
      noNail: true,
      skin: [151, 114, 94],
      background: [151, 114, 94],
      noise: 20,
    }),
  ],
  ["heavy-blur", blurFrame(makeContourFixture(), 20, 3)],
  [
    "ambiguous-two-regions",
    makeContourFixture({
      objects: [
        { cx: 0.34, cy: 0.5, w: 0.2, h: 0.34, angle: 0, shape: "rounded" },
        { cx: 0.66, cy: 0.5, w: 0.2, h: 0.34, angle: 0, shape: "rounded" },
      ],
    }),
  ],
  ["glare-hole", makeContourFixture({ glare: true })],
  ["horizontal-direction", makeContourFixture({ angle: 90 })],
  ["edge-clipped", makeContourFixture({ cx: 0.05 })],
];
for (const [name, fixture] of negative) {
  const result = detectNailContour(fixture);
  assert.equal(result.status, "unavailable", `${name}: unexpected candidate`);
  assert(result.reason.length > 15);
  await writeFixturePNG(fixture, join(output, `${name}.png`));
  console.log(`PASS abstention ${name}: ${result.reason}`);
  passed++;
}
assert.equal(
  detectNailContour({ width: 1, height: 1, data: new Uint8ClampedArray(4) })
    .status,
  "unavailable",
);
assert.equal(
  detectNailContour({
    width: 100,
    height: 100,
    data: new Uint8ClampedArray(10),
  }).status,
  "unavailable",
);
passed++;
const narrow = detectNailContour(makeContourFixture({ nailWidth: 0.28 }));
const broad = detectNailContour(makeContourFixture({ nailWidth: 0.41 }));
assert.equal(narrow.status, "candidate");
assert.equal(broad.status, "candidate");
const span = (result) =>
  Math.max(...result.points.map((p) => p.x)) -
  Math.min(...result.points.map((p) => p.x));
assert(
  span(broad) - span(narrow) > 0.1,
  "Shape width must adapt to the observed boundary.",
);
passed++;
const sameFrameUp = detectNailContour(makeContourFixture(), {
  tipDirection: "up",
});
const sameFrameDown = detectNailContour(makeContourFixture(), {
  tipDirection: "down",
});
assert.equal(sameFrameUp.status, "candidate");
assert.equal(sameFrameDown.status, "candidate");
assert(
  Math.hypot(
    sameFrameUp.points[0].x - sameFrameDown.points[6].x,
    sameFrameUp.points[0].y - sameFrameDown.points[6].y,
  ) < 0.005,
);
assert(
  Math.hypot(
    sameFrameUp.points[6].x - sameFrameDown.points[0].x,
    sameFrameUp.points[6].y - sameFrameDown.points[0].y,
  ) < 0.005,
);
passed++;
const a = detectNailContour(makeContourFixture({ cx: 0.42 })),
  b = detectNailContour(makeContourFixture({ cx: 0.58 }));
assert.equal(a.status, "candidate");
assert.equal(b.status, "candidate");
const centre = (result) =>
  result.points.reduce((sum, p) => sum + p.x, 0) / result.points.length;
assert(
  centre(b) - centre(a) > 0.13,
  "Proposal must move with source image, not a fixed template.",
);
passed++;
const report = {
  fixture_scope:
    "Synthetic optical controls only; no biological photographs or clinical accuracy validation.",
  checks_passed: passed,
  measurements,
};
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
console.log(`${passed} algorithm checks passed. ${output}/report.json`);
