/** Projected 2D polygon measurements, ported from backend/app/measurement.py.
 * No inference of surface arc lengths, curvature, physical fit, or confidence.
 */
import type { Calibration, Measurement, Point } from "../types";

export type MeasurementInput = {
  image_id: string;
  contour: Point[];
  calibration: Calibration;
  method?: "calibrated_photo";
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function point(value: unknown): Point {
  const p = record(value, "Image point");
  if (
    Object.keys(p).some((key) => !["x", "y"].includes(key)) ||
    typeof p.x !== "number" ||
    typeof p.y !== "number" ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y) ||
    p.x < 0 ||
    p.y < 0
  ) {
    throw new Error(
      "Image points must have finite, nonnegative x and y coordinates.",
    );
  }
  return { x: p.x, y: p.y };
}

export function validateMeasurementInput(value: unknown): MeasurementInput {
  const input = record(value, "Measurement");
  if (
    Object.keys(input).some(
      (key) => !["image_id", "contour", "calibration", "method"].includes(key),
    )
  ) {
    throw new Error("The measurement request contains an unsupported field.");
  }
  if (typeof input.image_id !== "string" || !input.image_id)
    throw new Error("Select the top-view photograph to measure.");
  if (!Array.isArray(input.contour) || input.contour.length !== 12)
    throw new Error("Exactly twelve contour control points are required.");
  if (input.method !== undefined && input.method !== "calibrated_photo")
    throw new Error(
      "Only calibrated photographic 2D measurement is available.",
    );
  const calibration = record(input.calibration, "Calibration");
  if (
    Object.keys(calibration).some(
      (key) => !["a", "b", "reference_mm"].includes(key),
    ) ||
    typeof calibration.reference_mm !== "number" ||
    !Number.isFinite(calibration.reference_mm) ||
    calibration.reference_mm <= 0 ||
    calibration.reference_mm > 200
  ) {
    throw new Error(
      "Enter a known reference dimension greater than zero and no more than 200 mm.",
    );
  }
  return {
    image_id: input.image_id,
    contour: input.contour.map(point),
    calibration: {
      a: point(calibration.a),
      b: point(calibration.b),
      reference_mm: calibration.reference_mm,
    },
    method: "calibrated_photo",
  };
}

const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a: Point, b: Point, p: Point) =>
  Math.min(a.x, b.x) - 1e-8 <= p.x &&
  p.x <= Math.max(a.x, b.x) + 1e-8 &&
  Math.min(a.y, b.y) - 1e-8 <= p.y &&
  p.y <= Math.max(a.y, b.y) + 1e-8;

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const [x1, x2, x3, x4] = [
    cross(a, b, c),
    cross(a, b, d),
    cross(c, d, a),
    cross(c, d, b),
  ];
  if (
    x1 > 0 !== x2 > 0 &&
    x3 > 0 !== x4 > 0 &&
    [x1, x2, x3, x4].every((v) => Math.abs(v) > 1e-8)
  )
    return true;
  return (
    (Math.abs(x1) < 1e-8 && onSegment(a, b, c)) ||
    (Math.abs(x2) < 1e-8 && onSegment(a, b, d)) ||
    (Math.abs(x3) < 1e-8 && onSegment(c, d, a)) ||
    (Math.abs(x4) < 1e-8 && onSegment(c, d, b))
  );
}

function sectionWidth(points: Point[], station: number) {
  const intersections: number[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    if (
      (a.y <= station && station < b.y) ||
      (b.y <= station && station < a.y)
    ) {
      intersections.push(a.x + ((station - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  });
  return intersections.length >= 2
    ? Math.max(...intersections) - Math.min(...intersections)
    : 0;
}

const round5 = (value: number) => Math.round(value * 100000) / 100000;

export function measurePolygon(
  value: unknown,
  width: number,
  height: number,
): Measurement {
  const input = validateMeasurementInput(value);
  const { contour, calibration } = input;
  if (![width, height].every((v) => Number.isFinite(v) && v > 0))
    throw new Error("Original image dimensions are unavailable.");
  if (
    [...contour, calibration.a, calibration.b].some(
      (p) => p.x >= width || p.y >= height,
    )
  ) {
    throw new Error(
      "Contour and calibration points must be inside the original image.",
    );
  }
  if (new Set(contour.map((p) => `${p.x},${p.y}`)).size !== contour.length)
    throw new Error("Contour points must be distinct.");
  const area2 = contour.reduce(
    (sum, p, i) =>
      sum + p.x * contour[(i + 1) % 12].y - contour[(i + 1) % 12].x * p.y,
    0,
  );
  if (Math.abs(area2) < 8) throw new Error("The contour has no usable area.");
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      if (j === i + 1 || (i === 0 && j === 11)) continue;
      if (
        segmentsIntersect(
          contour[i],
          contour[(i + 1) % 12],
          contour[j],
          contour[(j + 1) % 12],
        )
      ) {
        throw new Error(
          "Contour edges cross or touch. Correct the control points before measuring.",
        );
      }
    }
  }
  const referencePx = Math.hypot(
    calibration.b.x - calibration.a.x,
    calibration.b.y - calibration.a.y,
  );
  if (referencePx < 5)
    throw new Error(
      "Calibration endpoints must be at least five image pixels apart.",
    );
  const scale = calibration.reference_mm / referencePx;
  const proximal = contour[0],
    distal = contour[6];
  const lengthPx = Math.hypot(distal.x - proximal.x, distal.y - proximal.y);
  if (lengthPx < 5)
    throw new Error(
      "Cuticle and distal landmarks must be at least five image pixels apart.",
    );
  const along = {
    x: (distal.x - proximal.x) / lengthPx,
    y: (distal.y - proximal.y) / lengthPx,
  };
  const across = { x: along.y, y: -along.x };
  const local = contour.map((p) => ({
    x: (p.x - proximal.x) * across.x + (p.y - proximal.y) * across.y,
    y: (p.x - proximal.x) * along.x + (p.y - proximal.y) * along.y,
  }));
  if (local[3].x <= 1 || local[9].x >= -1)
    throw new Error(
      "Mark point 3 on the right sidewall and point 9 on the left, relative to the cuticle-to-distal axis.",
    );
  const minY = Math.min(...local.map((p) => p.y)),
    maxY = Math.max(...local.map((p) => p.y));
  if (minY < -lengthPx * 0.1 || maxY > lengthPx * 1.1)
    throw new Error(
      "The cuticle and distal landmarks do not span this contour. Correct points 0 and 6.",
    );
  const stations = [...new Set(local.map((p) => p.y))].sort((a, b) => a - b);
  const candidates = [
    ...stations.slice(0, -1).map((y) => y + 1e-6),
    ...stations.slice(0, -1).map((a, i) => (a + stations[i + 1]) / 2),
    ...stations.slice(1).map((y) => y - 1e-6),
  ];
  const widthPx = Math.max(0, ...candidates.map((y) => sectionWidth(local, y)));
  if (widthPx < 2) throw new Error("The contour is too narrow to measure.");
  const warnings = [
    "Physical scale assumes the reference and contour lie in the same plane. Two reference points cannot verify this or correct perspective.",
    "Length and widths are projected 2D measurements of a manually reviewed polygon, not surface arc lengths or a verified fit.",
    "Curvature remains unknown; front, side, and oblique photos are retained for professional inspection only.",
  ];
  if (minY < -lengthPx * 0.05 || maxY > lengthPx * 1.05)
    warnings.push(
      "Some boundary points extend beyond the cuticle/distal axis landmarks. Review the landmark placement.",
    );
  return {
    length_mm: round5(lengthPx * scale),
    width_mm: round5(widthPx * scale),
    sectional_widths_mm: [0.1, 0.25, 0.5, 0.75, 0.9].map((t) => ({
      t,
      width_mm: round5(sectionWidth(local, t * lengthPx) * scale),
    })),
    scale_mm_per_px: scale,
    method: "calibrated_photo",
    provenance: {
      length_mm: "measured",
      width_mm: "measured",
      transverse_rise_mm: "unknown",
      longitudinal_rise_mm: "unknown",
    },
    uncertainty:
      "Unquantified: manual landmark placement, reference dimensions, perspective, and coplanarity have not been independently validated.",
    warnings,
    contour,
    calibration,
    image_id: input.image_id,
  };
}
