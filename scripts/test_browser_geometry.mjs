#!/usr/bin/env node
/** Generate real browser artifacts for independent OpenCascade import checks. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(join(root, "frontend/package.json"));
const esbuild = require("esbuild");
const output = process.argv[2]
  ? resolve(process.argv[2])
  : await mkdtemp(join(tmpdir(), "nailform-browser-cad-"));
await mkdir(output, { recursive: true });
await esbuild.build({
  entryPoints: [join(root, "frontend/src/browser/geometry.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outfile: join(output, "geometry.mjs"),
});
const { generateBrowserGeometry, inspectBrowserMesh, browserSurfacePoint } =
  await import(pathToFileURL(join(output, "geometry.mjs")).href);
const base = {
  length_mm: 15,
  width_mm: 12,
  transverse_rise_mm: 1.2,
  longitudinal_rise_mm: 0.4,
  thickness_mm: 0.5,
  extension_mm: 2,
  tip_shape: "oval",
  asymmetry_mm: 0,
};
const variants = [
  ["oval", {}],
  ["almond-asymmetric", { tip_shape: "almond", asymmetry_mm: 1.5 }],
  [
    "squoval-extended",
    { tip_shape: "squoval", extension_mm: 15, asymmetry_mm: -1.5 },
  ],
  ["flat", { transverse_rise_mm: 0, longitudinal_rise_mm: 0 }],
  [
    "small-flat",
    {
      length_mm: 4,
      width_mm: 3,
      transverse_rise_mm: 0,
      longitudinal_rise_mm: 0,
      thickness_mm: 0.25,
      extension_mm: 0,
    },
  ],
  [
    "wide-high",
    {
      length_mm: 4,
      width_mm: 30,
      transverse_rise_mm: 6,
      longitudinal_rise_mm: 4,
      thickness_mm: 1.5,
      extension_mm: 0,
    },
  ],
];
let passed = 0;
for (const [name, overrides] of variants) {
  const geometry = generateBrowserGeometry({ ...base, ...overrides });
  assert.equal(geometry.validation.passed, true);
  assert(Object.values(geometry.validation.checks).every(Boolean));
  assert.equal(geometry.validation.cad_kernel_validity_verified, false);
  assert.equal(geometry.validation.global_minimum_thickness_verified, false);
  assert.equal(
    geometry.validation.self_intersections_independently_verified,
    false,
  );
  assert.equal(geometry.validation.step_roundtrip_verified_in_browser, false);
  const { vertices, faces } = geometry.mesh;
  const stlBytes = await geometry.stl.arrayBuffer();
  const stl = new DataView(stlBytes);
  assert.equal(stl.getUint32(80, true), faces.length);
  assert.equal(stlBytes.byteLength, 84 + 50 * faces.length);
  // Decode every exported STL coordinate independently and compare it to the
  // viewer mesh. The browser deliberately quantizes shared vertices once.
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    for (let corner = 0; corner < 3; corner++)
      for (let axis = 0; axis < 3; axis++) {
        assert.equal(
          stl.getFloat32(
            84 + faceIndex * 50 + 12 + corner * 12 + axis * 4,
            true,
          ),
          vertices[faces[faceIndex][corner]][axis],
        );
      }
  }
  const layers = vertices.length / 2;
  for (let i = 0; i < layers; i++) {
    const separation = Math.hypot(
      ...vertices[i].map((value, axis) => vertices[i + layers][axis] - value),
    );
    assert(Math.abs(separation - geometry.parameters.thickness_mm) < 1e-5);
  }
  const step = await geometry.step.text();
  assert(step.includes("FACETED_BREP_SHAPE_REPRESENTATION"));
  assert.equal((step.match(/=FACE_SURFACE\(/g) ?? []).length, faces.length);
  assert.equal(
    (step.match(/=CARTESIAN_POINT\(/g) ?? []).length,
    vertices.length,
  );
  assert(step.includes("SI_UNIT(.MILLI.,.METRE.)"));
  const folder = join(output, name);
  await mkdir(folder, { recursive: true });
  await Promise.all([
    writeFile(join(folder, "model.stl"), new Uint8Array(stlBytes)),
    writeFile(join(folder, "model.step"), step),
    writeFile(
      join(folder, "model.json"),
      JSON.stringify({ ...geometry, stl: undefined, step: undefined }),
    ),
  ]);
  console.log(
    `PASS browser CAD: ${name}; ${faces.length} triangles; volume ${geometry.metadata.volume_mm3.toFixed(6)} mm³`,
  );
  passed++;
}
for (const invalid of [
  { width_mm: 0 },
  { length_mm: NaN },
  { thickness_mm: -1 },
  { thickness_mm: true },
  { extension_mm: 100 },
  { transverse_rise_mm: 6, width_mm: 5 },
  { asymmetry_mm: 2, width_mm: 3 },
  { tip_shape: "rectangle" },
]) {
  assert.throws(() => generateBrowserGeometry({ ...base, ...invalid }));
  passed++;
}
const original = generateBrowserGeometry(base);
const thicker = generateBrowserGeometry({ ...base, thickness_mm: 0.9 });
const flatter = generateBrowserGeometry({ ...base, transverse_rise_mm: 0.2 });
assert(thicker.metadata.volume_mm3 > original.metadata.volume_mm3 * 1.5);
assert(flatter.metadata.dimensions_mm.z < original.metadata.dimensions_mm.z);
passed++;
const open = { ...original.mesh, faces: original.mesh.faces.slice(1) };
assert.equal(inspectBrowserMesh(open).checks.watertight_mesh, false);
const reversed = {
  ...original.mesh,
  faces: original.mesh.faces.map((face) => [...face].reverse()),
};
assert.equal(inspectBrowserMesh(reversed).checks.nonzero_volume, false);
passed++;
for (const extension of [0, 0.1, 2, 15]) {
  const parameters = { ...base, extension_mm: extension, asymmetry_mm: 1.5 };
  const boundary = parameters.length_mm / (parameters.length_mm + extension);
  for (const u of [-1, -0.6, 0, 0.4, 1])
    for (const fraction of [0, 0.2, 0.45, 0.8, 1]) {
      const expected = browserSurfacePoint(u, fraction * boundary, parameters);
      for (const shape of ["oval", "almond", "squoval"])
        assert.deepEqual(
          browserSurfacePoint(u, fraction * boundary, {
            ...parameters,
            tip_shape: shape,
          }),
          expected,
        );
    }
}
passed++;
const shapeModels = ["oval", "almond", "squoval"].map((tip_shape) =>
  generateBrowserGeometry({ ...base, tip_shape }),
);
for (const model of shapeModels) {
  assert.equal(model.metadata.tip_shape_applies_to, "free_edge_extension");
  assert.equal(model.metadata.landmarks_mm.distal[1], base.length_mm);
  assert.equal(
    model.metadata.landmarks_mm.design_tip[1],
    base.length_mm + base.extension_mm,
  );
}
assert.notDeepEqual(shapeModels[0].mesh.vertices, shapeModels[1].mesh.vertices);
const along = shapeModels[0].metadata.sampling_grid.along;
for (let acrossIndex = 0; acrossIndex < 25; acrossIndex++)
  for (let alongIndex = 0; alongIndex <= 32; alongIndex++) {
    const index = acrossIndex * along + alongIndex;
    for (const other of shapeModels.slice(1)) {
      assert.deepEqual(
        other.mesh.vertices[index],
        shapeModels[0].mesh.vertices[index],
      );
      assert.deepEqual(
        other.mesh.vertices[index + 25 * along],
        shapeModels[0].mesh.vertices[index + 25 * along],
      );
    }
  }
passed++;
const noExtension = ["oval", "almond", "squoval"].map((tip_shape) =>
  generateBrowserGeometry({ ...base, extension_mm: 0, tip_shape }),
);
for (const model of noExtension.slice(1)) {
  assert.deepEqual(model.mesh, noExtension[0].mesh);
  assert.deepEqual(
    new Uint8Array(await model.stl.arrayBuffer()),
    new Uint8Array(await noExtension[0].stl.arrayBuffer()),
  );
  assert.equal(model.metadata.tip_shape_active, false);
}
passed++;
console.log(
  `${passed} browser geometry checks passed. Independent CAD fixtures: ${output}`,
);
