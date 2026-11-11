#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(join(root, "frontend/package.json"));
const output = await mkdtemp(join(tmpdir(), "nailform-framing-guidance-"));
await require("esbuild").build({
  entryPoints: [join(root, "frontend/src/capture/liveFramingGuidance.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: join(output, "guidance.mjs"),
});
const { framingTarget, liveFramingGuidance } = await import(
  pathToFileURL(join(output, "guidance.mjs"))
);
let passed = 0;
const check = (name, run) => {
  run();
  passed++;
  console.log("PASS", name);
};
// Independent ellipse landmarks specify camera-space positions and orientation.
const observation = ({
  cx = 0.5,
  cy = 0.5,
  w = 0.3,
  h = 0.5,
  angle = 0,
  tipDirection = "up",
  steady = false,
} = {}) => {
  const width = 270,
    height = 360,
    theta = (angle * Math.PI) / 180;
  const points = Array.from({ length: 12 }, (_, i) => {
    const phase = Math.PI / 2 + (i * Math.PI) / 6;
    const x = (Math.cos(phase) * w * width) / 2,
      y = (Math.sin(phase) * h * height) / 2;
    return {
      x: cx + (x * Math.cos(theta) - y * Math.sin(theta)) / width,
      y: cy + (x * Math.sin(theta) + y * Math.cos(theta)) / height,
    };
  });
  return { width, height, points, outline: points, tipDirection, steady };
};
for (const [width, height] of [
  [270, 360],
  [360, 640],
  [640, 480],
  [1920, 1080],
  [360, 360],
])
  check(`physical guide aspect and bounds ${width}x${height}`, () => {
    const target = framingTarget(width, height);
    assert(
      Math.abs((target.width * width) / (target.height * height) - 0.58) <
        1e-10,
    );
    assert(
      target.x >= 0 &&
        target.y >= 0 &&
        target.x + target.width <= 1 &&
        target.y + target.height <= 1,
    );
    assert.equal(target.cx, 0.5);
    assert.equal(target.cy, 0.5);
  });
for (const [name, position, action] of [
  ["candidate on right", { cx: 0.8 }, "move_left"],
  ["candidate on left", { cx: 0.2 }, "move_right"],
  ["candidate below", { cy: 0.8, h: 0.32 }, "move_up"],
  ["candidate above", { cy: 0.2, h: 0.32 }, "move_down"],
])
  check(name, () =>
    assert.equal(liveFramingGuidance(observation(position)).action, action),
  );
check("small centered candidate asks closer", () =>
  assert.equal(
    liveFramingGuidance(observation({ w: 0.1, h: 0.16 })).action,
    "closer",
  ),
);
check("large centered candidate asks farther", () =>
  assert.equal(
    liveFramingGuidance(observation({ w: 0.66, h: 0.9 })).action,
    "farther",
  ),
);
check("clockwise axis asks counterclockwise turn", () =>
  assert.equal(
    liveFramingGuidance(observation({ angle: 40 })).action,
    "rotate_left",
  ),
);
check("counterclockwise axis asks clockwise turn", () =>
  assert.equal(
    liveFramingGuidance(observation({ angle: -40 })).action,
    "rotate_right",
  ),
);
check("downward direction is not mistaken for misalignment", () =>
  assert.equal(
    liveFramingGuidance(observation({ angle: 180, tipDirection: "down" }))
      .action,
    "hold",
  ),
);
check("steady off-center boundary still receives positioning guidance", () => {
  const input = observation({ cx: 0.8, steady: true });
  assert.equal(liveFramingGuidance(input).action, "move_left");
  assert.equal(input.steady, true);
});
check("aligned steady boundary asks hold still and capture", () => {
  assert.equal(
    liveFramingGuidance(observation({ steady: true })).message,
    "Hold still — you can capture now.",
  );
});
check("no candidate never invents a movement direction", () =>
  assert.equal(
    liveFramingGuidance({
      width: 270,
      height: 360,
      tipDirection: "up",
      steady: false,
    }).action,
    "place",
  ),
);
check("stale steadiness without a candidate still gives a neutral guide", () =>
  assert.equal(
    liveFramingGuidance({
      width: 270,
      height: 360,
      tipDirection: "up",
      steady: true,
    }).action,
    "place",
  ),
);
check("non-finite landmark cannot drive guidance", () => {
  const input = observation();
  input.points[3] = { x: NaN, y: 0.5 };
  assert.equal(liveFramingGuidance(input).action, "place");
});
console.log(
  JSON.stringify({
    passed,
    failed: 0,
    scope:
      "Pure framing logic and camera-space transforms; not biological validation.",
  }),
);
