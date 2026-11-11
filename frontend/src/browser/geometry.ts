/**
 * Browser-only faceted research shell. No CAD kernel runs in this module.
 *
 * The corrected surface equations match backend/app/geometry.py, but the browser
 * samples and triangulates them directly instead of fitting B-spline surfaces.
 * Viewer, binary STL and planar FACETED_BREP STEP share the exact same vertices.
 */
import type { GeometryParameters } from "../types";

export type BrowserMesh = { vertices: number[][]; faces: number[][] };
export type BrowserGeometry = {
  parameters: GeometryParameters;
  metadata: Record<string, unknown>;
  validation: Record<string, unknown>;
  mesh: BrowserMesh;
  stl: Blob;
  step: Blob;
};
type Vec3 = [number, number, number];

const BOUNDS: Record<
  Exclude<keyof GeometryParameters, "tip_shape">,
  [number, number]
> = {
  length_mm: [4, 40],
  width_mm: [3, 30],
  transverse_rise_mm: [0, 6],
  longitudinal_rise_mm: [0, 4],
  thickness_mm: [0.25, 1.5],
  extension_mm: [0, 15],
  asymmetry_mm: [-2, 2],
};

export const BROWSER_GEOMETRY_LIMITATIONS = [
  "Directly sampled, faceted parametric shell. This browser engine does not fit the smooth B-spline surfaces used by the Python CadQuery engine.",
  "Projected length/width and manual curvature inputs do not reconstruct the photographic contour as a verified 3D contact surface.",
  "Thickness is a displacement along sampled surface normals. Neither global minimum wall thickness nor interior surface separation is verified.",
  "Mesh edge topology, winding, finite coordinates, triangle area and signed volume are checked. No CAD kernel or independent global self-intersection check runs in the browser.",
  "STEP contains planar triangular faces in a faceted BRep, not editable smooth parametric surfaces. Runtime STEP re-import is not performed in this browser.",
  "No fastening allowance, printer compensation, material suitability or physical fit has been validated. Non-wearable laboratory prototype only.",
  "Tip shape changes only the requested free-edge extension. With zero extension the shape selection has no geometric effect.",
];

function sub(a: number[], b: number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: number[], b: number[]): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function magnitude(a: number[]): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function unit(a: number[]): Vec3 {
  const size = magnitude(a);
  if (!Number.isFinite(size) || size < 1e-12)
    throw new Error("Degenerate surface or triangle for these parameters.");
  return [a[0] / size, a[1] / size, a[2] / size];
}

export function validateBrowserParameters(
  parameters: GeometryParameters,
): GeometryParameters {
  for (const [name, [low, high]] of Object.entries(BOUNDS)) {
    const value = parameters[name as keyof GeometryParameters];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < low ||
      value > high
    ) {
      throw new Error(
        `${name} must be a finite number between ${low} and ${high} mm.`,
      );
    }
  }
  if (parameters.transverse_rise_mm > 0.45 * parameters.width_mm) {
    throw new Error(
      "Transverse rise must not exceed 45% of width in this engine.",
    );
  }
  if (
    Math.abs(parameters.asymmetry_mm) > Math.min(2, parameters.width_mm * 0.15)
  ) {
    throw new Error("Asymmetry must not exceed 15% of width (maximum 2 mm).");
  }
  if (!["oval", "squoval", "almond"].includes(parameters.tip_shape)) {
    throw new Error("tip_shape must be oval, squoval or almond.");
  }
  return { ...parameters };
}

function bodyWidth(t: number, width: number): [number, number] {
  if (t <= 0.45)
    return [
      width * (0.72 + 0.28 * Math.sin((Math.PI * t) / 0.9)),
      ((width * 0.28 * Math.PI) / 0.9) * Math.cos((Math.PI * t) / 0.9),
    ];
  const s = (t - 0.45) / 0.55;
  return [
    width * (1 - 0.12 * (3 * s ** 2 - 2 * s ** 3)),
    (-width * 0.12 * 6 * s * (1 - s)) / 0.55,
  ];
}
function tipCap(u: number, shape: GeometryParameters["tip_shape"]): number {
  if (shape === "oval") return Math.sqrt(Math.max(0.01, 1 - 0.95 * u ** 2));
  if (shape === "almond") return 1 - 0.9 * u ** 2;
  return 1 - 0.12 * u ** 4;
}

function extensionReach(s: number, cap: number): [number, number] {
  const blend = cap;
  const speed = (cap - blend / 3) / (1 - blend / 3);
  if (s <= blend)
    return [
      speed * s +
        (1 - speed) * (s - s ** 2 / blend + s ** 3 / (3 * blend ** 2)),
      speed + (1 - speed) * (1 - s / blend) ** 2,
    ];
  return [speed * s + ((1 - speed) * blend) / 3, speed];
}

/** Natural body is independent of selected tip; only its distal extension is trimmed. */
export function browserSurfacePoint(
  u: number,
  v: number,
  p: GeometryParameters,
): Vec3 {
  const physicalY = (p.length_mm + p.extension_mm) * v;
  const t = Math.min(1, physicalY / p.length_mm);
  const [sectionWidth] = bodyWidth(t, p.width_mm);
  const sin2 = Math.sin(Math.PI * t) ** 2;
  const cuticleBow = Math.min(0.07 * p.length_mm, 0.1 * p.width_mm);
  const y =
    p.extension_mm > 0 && v > p.length_mm / (p.length_mm + p.extension_mm)
      ? p.length_mm +
        p.extension_mm *
          extensionReach(
            (physicalY - p.length_mm) / p.extension_mm,
            tipCap(u, p.tip_shape),
          )[0]
      : physicalY + cuticleBow * (1 - t) ** 3 * u ** 2;
  return [
    (u * sectionWidth) / 2 + p.asymmetry_mm * sin2,
    y,
    p.transverse_rise_mm *
      (1 - u ** 2) *
      (0.85 + 0.15 * Math.sin(Math.PI * v)) +
      p.longitudinal_rise_mm * Math.sin(Math.PI * v),
  ];
}

function surfaceNormal(u: number, v: number, p: GeometryParameters): Vec3 {
  const total = p.length_mm + p.extension_mm;
  const physicalY = total * v;
  const bow = Math.sin(Math.PI * v);
  const zDerivative =
    ((0.15 * p.transverse_rise_mm * (1 - u ** 2) + p.longitudinal_rise_mm) *
      Math.PI *
      Math.cos(Math.PI * v)) /
    total;
  if (p.extension_mm > 0 && v > p.length_mm / total) {
    const s = (physicalY - p.length_mm) / p.extension_mm;
    const delta = 1e-5;
    const yU =
      (p.extension_mm *
        (extensionReach(s, tipCap(u + delta, p.tip_shape))[0] -
          extensionReach(s, tipCap(u - delta, p.tip_shape))[0])) /
      (2 * delta);
    const yDerivative = extensionReach(s, tipCap(u, p.tip_shape))[1];
    return unit(
      cross(
        [
          0.44 * p.width_mm,
          yU,
          -2 * u * p.transverse_rise_mm * (0.85 + 0.15 * bow),
        ],
        [0, yDerivative, zDerivative],
      ),
    );
  }
  const t = Math.min(1, physicalY / p.length_mm);
  const [sectionWidth, widthDerivative] = bodyWidth(t, p.width_mm);
  const cuticleBow = Math.min(0.07 * p.length_mm, 0.1 * p.width_mm);
  const derivative = Math.PI * Math.sin(2 * Math.PI * t);
  const du = [
    sectionWidth / 2,
    2 * cuticleBow * (1 - t) ** 3 * u,
    -2 * u * p.transverse_rise_mm * (0.85 + 0.15 * bow),
  ];
  const dv = [
    ((u * widthDerivative) / 2 + p.asymmetry_mm * derivative) / p.length_mm,
    1 - ((3 * cuticleBow) / p.length_mm) * (1 - t) ** 2 * u ** 2,
    zDerivative,
  ];
  const normal = cross(du, dv);
  if (normal[2] <= 0)
    throw new Error(
      "The design surface folds for these parameters. Reduce curvature or asymmetry.",
    );
  return unit(normal);
}

/** Topological validation only: this does not prove absence of intersections. */
export function inspectBrowserMesh(mesh: BrowserMesh) {
  const edges = new Map<string, { count: number; orientation: number }>();
  const adjacent = Array.from(
    { length: mesh.vertices.length },
    () => [] as number[],
  );
  let finite = mesh.vertices.every(
    (v) => v.length === 3 && v.every(Number.isFinite),
  );
  let nondegenerate = mesh.faces.length > 0;
  let signedVolume = 0;
  let area = 0;
  for (const face of mesh.faces) {
    if (
      face.length !== 3 ||
      face.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= mesh.vertices.length,
      )
    ) {
      finite = false;
      nondegenerate = false;
      continue;
    }
    const [a, b, c] = face.map((i) => mesh.vertices[i]);
    const normal = cross(sub(b, a), sub(c, a));
    const triangleArea = magnitude(normal) / 2;
    nondegenerate &&= Number.isFinite(triangleArea) && triangleArea > 1e-12;
    area += triangleArea;
    signedVolume += dot(a, cross(b, c)) / 6;
    for (let i = 0; i < 3; i++) {
      const from = face[i],
        to = face[(i + 1) % 3];
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const record = edges.get(key) ?? { count: 0, orientation: 0 };
      record.count += 1;
      record.orientation += from < to ? 1 : -1;
      edges.set(key, record);
      adjacent[from].push(to);
      adjacent[to].push(from);
    }
  }
  const visited = new Set<number>();
  const pending = mesh.vertices.length ? [0] : [];
  while (pending.length) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbour of adjacent[current])
      if (!visited.has(neighbour)) pending.push(neighbour);
  }
  return {
    checks: {
      finite_mesh: finite,
      nondegenerate_triangles: nondegenerate,
      watertight_mesh:
        edges.size > 0 && [...edges.values()].every((edge) => edge.count === 2),
      consistent_normals:
        edges.size > 0 &&
        [...edges.values()].every(
          (edge) => edge.count === 2 && edge.orientation === 0,
        ),
      nonzero_volume: Number.isFinite(signedVolume) && signedVolume > 1e-5,
      connected_mesh:
        mesh.vertices.length > 0 && visited.size === mesh.vertices.length,
      sphere_topology:
        mesh.vertices.length - edges.size + mesh.faces.length === 2,
    },
    signedVolume,
    area,
  };
}

/** Binary STL has no units field. Coordinates are explicitly documented as mm. */
export function encodeBinarySTL(mesh: BrowserMesh): Blob {
  const buffer = new ArrayBuffer(84 + mesh.faces.length * 50);
  const view = new DataView(buffer);
  const header = new TextEncoder().encode(
    "NAILFORM LAB | mm | faceted research shell | NOT FOR WEAR",
  );
  new Uint8Array(buffer, 0, header.length).set(header);
  view.setUint32(80, mesh.faces.length, true);
  let offset = 84;
  for (const face of mesh.faces) {
    const points = face.map((i) => mesh.vertices[i]);
    const normal = unit(
      cross(sub(points[1], points[0]), sub(points[2], points[0])),
    );
    for (const vector of [normal, ...points]) {
      for (const coordinate of vector) {
        view.setFloat32(offset, coordinate, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "model/stl" });
}

function stepNumber(value: number): string {
  if (!Number.isFinite(value))
    throw new Error("STEP cannot encode a non-finite coordinate.");
  let result = Number(value.toPrecision(12)).toString().toUpperCase();
  if (!result.includes("."))
    result = result.includes("E") ? result.replace("E", ".E") : `${result}.`;
  return result;
}

/**
 * A genuine ISO 10303-21 AP203 faceted BRep. Each triangle is a FACE_SURFACE
 * backed by an explicit PLANE; plain FACE without a surface is not sufficient
 * for a valid OpenCascade solid. All loops reference the shared mesh vertices.
 */
export function encodeFacetedSTEP(mesh: BrowserMesh): Blob {
  const lines = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('NAILFORM LAB faceted laboratory shell; millimetres; NOT FOR WEAR'),'2;1');",
    `FILE_NAME('nailform.step','${new Date().toISOString()}',('NAILFORM LAB'),(''),'NAILFORM browser faceted mesh V1','NAILFORM LAB','');`,
    "FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));",
    "ENDSEC;",
    "DATA;",
    "#1=APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies');",
    "#2=APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,#1);",
    "#3=MECHANICAL_CONTEXT('',#1,'mechanical');",
    "#4=PRODUCT('NAILFORM LAB','NAILFORM LAB','Non-wearable faceted research shell',(#3));",
    "#5=PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',#4,.NOT_KNOWN.);",
    "#6=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');",
    "#7=PRODUCT_DEFINITION('design','',#5,#6);",
    "#8=PRODUCT_DEFINITION_SHAPE('','',#7);",
    "#9=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));",
    "#10=(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));",
    "#11=(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());",
    "#12=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.000001),#9,'distance_accuracy_value','confusion accuracy');",
    "#13=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#12)) GLOBAL_UNIT_ASSIGNED_CONTEXT((#9,#10,#11)) REPRESENTATION_CONTEXT('',''));",
  ];
  let id = 14;
  const vertices = mesh.vertices.map((vertex) => {
    const vertexId = id++;
    lines.push(
      `#${vertexId}=CARTESIAN_POINT('',(${vertex.map(stepNumber).join(",")}));`,
    );
    return vertexId;
  });
  const faces: number[] = [];
  for (const face of mesh.faces) {
    const [a, b, c] = face.map((i) => mesh.vertices[i]);
    const normal = unit(cross(sub(b, a), sub(c, a)));
    const reference = unit(sub(b, a));
    lines.push(
      `#${id}=POLY_LOOP('',(${face.map((i) => `#${vertices[i]}`).join(",")}));`,
    );
    lines.push(`#${id + 1}=FACE_OUTER_BOUND('',#${id},.T.);`);
    lines.push(
      `#${id + 2}=DIRECTION('',(${normal.map(stepNumber).join(",")}));`,
    );
    lines.push(
      `#${id + 3}=DIRECTION('',(${reference.map(stepNumber).join(",")}));`,
    );
    lines.push(
      `#${id + 4}=AXIS2_PLACEMENT_3D('',#${vertices[face[0]]},#${id + 2},#${id + 3});`,
    );
    lines.push(`#${id + 5}=PLANE('',#${id + 4});`);
    lines.push(`#${id + 6}=FACE_SURFACE('',(#${id + 1}),#${id + 5},.T.);`);
    faces.push(id + 6);
    id += 7;
  }
  lines.push(
    `#${id}=CLOSED_SHELL('',(${faces.map((value) => `#${value}`).join(",")}));`,
  );
  lines.push(`#${id + 1}=FACETED_BREP('NAILFORM LAB faceted shell',#${id});`);
  lines.push(
    `#${id + 2}=FACETED_BREP_SHAPE_REPRESENTATION('',(#${id + 1}),#13);`,
  );
  lines.push(`#${id + 3}=SHAPE_DEFINITION_REPRESENTATION(#8,#${id + 2});`);
  lines.push("ENDSEC;", "END-ISO-10303-21;", "");
  return new Blob([lines.join("\n")], { type: "model/step" });
}

export function generateBrowserGeometry(
  parameters: GeometryParameters,
): BrowserGeometry {
  const p = validateBrowserParameters(parameters);
  // Resolution is fixed and recorded; the browser output is deliberately a
  // faceted shell. Coordinates are quantized once to STL's float32 precision so
  // exported STL, STEP and the viewer all consume the same geometric vertices.
  const across = 25,
    along = 41,
    layerSize = across * along;
  const vertices: number[][] = [];
  const outerVertices: number[][] = [];
  for (let i = 0; i < across; i++) {
    const u = -1 + (2 * i) / (across - 1);
    for (let j = 0; j < along; j++) {
      const boundary = p.length_mm / (p.length_mm + p.extension_mm);
      const v =
        p.extension_mm > 0
          ? j <= 32
            ? (boundary * j) / 32
            : boundary + ((1 - boundary) * (j - 32)) / 8
          : j / (along - 1);
      const point = browserSurfacePoint(u, v, p);
      const normal = surfaceNormal(u, v, p);
      vertices.push(point.map(Math.fround));
      outerVertices.push(
        point.map((coordinate, axis) =>
          Math.fround(coordinate + p.thickness_mm * normal[axis]),
        ),
      );
    }
  }
  vertices.push(...outerVertices);
  const faces: number[][] = [];
  for (let i = 0; i < across - 1; i++) {
    for (let j = 0; j < along - 1; j++) {
      const a = i * along + j,
        b = (i + 1) * along + j,
        c = b + 1,
        d = a + 1;
      faces.push([a, c, b], [a, d, c]); // Inner surface faces down.
      faces.push(
        [a + layerSize, b + layerSize, c + layerSize],
        [a + layerSize, c + layerSize, d + layerSize],
      );
    }
  }
  // Counterclockwise boundary viewed from +Z. Every side shares its exact
  // boundary indices with both surfaces, avoiding independent-seam gaps.
  const boundary: number[] = [];
  for (let i = 0; i < across; i++) boundary.push(i * along);
  for (let j = 1; j < along; j++) boundary.push((across - 1) * along + j);
  for (let i = across - 2; i >= 0; i--) boundary.push(i * along + along - 1);
  for (let j = along - 2; j >= 1; j--) boundary.push(j);
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i],
      b = boundary[(i + 1) % boundary.length];
    faces.push([a, b, b + layerSize], [a, b + layerSize, a + layerSize]);
  }
  const mesh = { vertices, faces };
  const inspection = inspectBrowserMesh(mesh);
  const minimum = [Infinity, Infinity, Infinity],
    maximum = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices)
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], vertex[axis]);
      maximum[axis] = Math.max(maximum[axis], vertex[axis]);
    }
  const dimensions = {
    x: maximum[0] - minimum[0],
    y: maximum[1] - minimum[1],
    z: maximum[2] - minimum[2],
  };
  const checks = {
    ...inspection.checks,
    expected_dimensions:
      dimensions.x >= p.width_mm * 0.7 &&
      dimensions.x <=
        p.width_mm + 2 * Math.abs(p.asymmetry_mm) + 2 * p.thickness_mm + 0.01 &&
      dimensions.y >= p.length_mm + p.extension_mm - 0.01 &&
      dimensions.y <=
        p.length_mm + p.extension_mm + 2 * p.thickness_mm + 0.01 &&
      dimensions.z > 0 &&
      dimensions.z <=
        p.transverse_rise_mm + p.longitudinal_rise_mm + p.thickness_mm + 0.01,
  };
  if (!Object.values(checks).every(Boolean)) {
    const failed = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    throw new Error(
      `Browser geometry failed mesh validation: ${failed.join(", ")}.`,
    );
  }
  const metadata: Record<string, unknown> = {
    units: "mm",
    engine: "NAILFORM browser faceted mesh V2",
    engine_version: "2.0-free-edge",
    geometry_kind: "faceted_parametric_shell",
    export_representation: "faceted_brep",
    wearable: false,
    fit_validated: false,
    solid_count: null,
    volume_mm3: inspection.signedVolume,
    mesh_volume_mm3: inspection.signedVolume,
    surface_area_mm2: inspection.area,
    dimensions_mm: dimensions,
    vertex_count: vertices.length,
    triangle_count: faces.length,
    sampling_grid: { across, along },
    coordinate_precision: "IEEE 754 float32, shared by viewer and both exports",
    thickness_definition:
      "Outer vertices displaced along sampled inner-surface normals; faceted interpolation between samples.",
    fastening_allowance_mm: 0,
    natural_length_mm: p.length_mm,
    tip_shape_applies_to: "free_edge_extension",
    tip_shape_active: p.extension_mm > 0,
    landmarks_mm: {
      cuticle: browserSurfacePoint(0, 0, p),
      distal: browserSurfacePoint(
        0,
        p.length_mm / (p.length_mm + p.extension_mm),
        p,
      ),
      design_tip: browserSurfacePoint(0, 1, p),
      left_sidewall: browserSurfacePoint(
        -1,
        (0.45 * p.length_mm) / (p.length_mm + p.extension_mm),
        p,
      ),
      right_sidewall: browserSurfacePoint(
        1,
        (0.45 * p.length_mm) / (p.length_mm + p.extension_mm),
        p,
      ),
    },
  };
  const validation: Record<string, unknown> = {
    ...checks,
    passed: true,
    checks,
    validation_scope:
      "Listed mesh checks only; no runtime CAD-kernel solid validation.",
    cad_kernel_validity_verified: false,
    self_intersections_independently_verified: false,
    global_minimum_thickness_verified: false,
    step_roundtrip_verified_in_browser: false,
    warnings: [
      "Experimental, non-wearable laboratory geometry. Physical fit is unverified.",
    ],
    limitations: BROWSER_GEOMETRY_LIMITATIONS,
  };
  return {
    parameters: p,
    metadata,
    validation,
    mesh,
    stl: encodeBinarySTL(mesh),
    step: encodeFacetedSTEP(mesh),
  };
}
