import type { NormalizedPoint, TipDirection } from "../vision/nailContour";

export type FramingAction =
  | "place"
  | "move_left"
  | "move_right"
  | "move_up"
  | "move_down"
  | "closer"
  | "farther"
  | "rotate_left"
  | "rotate_right"
  | "hold";
export type NormalizedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
};
export type FramingGuidance = {
  action: FramingAction;
  message: string;
  target: NormalizedBounds;
  bounds?: NormalizedBounds;
};
type Input = {
  width: number;
  height: number;
  points?: NormalizedPoint[];
  outline?: NormalizedPoint[];
  tipDirection: TipDirection;
  steady: boolean;
};

/** A relaxed photographic framing aid. It establishes no physical size or accuracy. */
export function framingTarget(width: number, height: number): NormalizedBounds {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const targetAspect = 0.58;
  let targetHeight = 0.7,
    targetWidth = (targetHeight * targetAspect) / aspect;
  if (targetWidth > 0.68) {
    targetWidth = 0.68;
    targetHeight = (targetWidth * aspect) / targetAspect;
  }
  return {
    x: (1 - targetWidth) / 2,
    y: (1 - targetHeight) / 2,
    width: targetWidth,
    height: targetHeight,
    cx: 0.5,
    cy: 0.5,
  };
}

/** Use only current image-derived points. Never infer a direction without a candidate. */
export function liveFramingGuidance(input: Input): FramingGuidance {
  const target = framingTarget(input.width, input.height);
  const result = (
    action: FramingAction,
    message: string,
    bounds?: NormalizedBounds,
  ): FramingGuidance => ({
    action,
    message,
    target,
    ...(bounds ? { bounds } : {}),
  });
  const valid = (point: NormalizedPoint) =>
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1;
  if (
    !input.points ||
    input.points.length !== 12 ||
    !input.points.every(valid)
  ) {
    return result("place", "Place one nail inside the guide.");
  }
  const contour =
    input.outline?.length && input.outline.every(valid)
      ? input.outline
      : input.points;
  const xs = contour.map((point) => point.x),
    ys = contour.map((point) => point.y);
  const x = Math.min(...xs),
    y = Math.min(...ys),
    width = Math.max(...xs) - x,
    height = Math.max(...ys) - y;
  const bounds = { x, y, width, height, cx: x + width / 2, cy: y + height / 2 };
  if (width <= 0 || height <= 0)
    return result("place", "Place one nail inside the guide.");
  const toleranceX = Math.max(0.045, target.width * 0.16),
    toleranceY = Math.max(0.055, target.height * 0.16);
  const driftX = (bounds.cx - target.cx) / toleranceX,
    driftY = (bounds.cy - target.cy) / toleranceY;
  if (Math.abs(driftX) > 1 || Math.abs(driftY) > 1) {
    if (Math.abs(driftX) >= Math.abs(driftY))
      return driftX > 0
        ? result("move_left", "Move the nail a little to the left.", bounds)
        : result("move_right", "Move the nail a little to the right.", bounds);
    return driftY > 0
      ? result("move_up", "Move the nail a little up.", bounds)
      : result("move_down", "Move the nail a little down.", bounds);
  }
  const axisX =
    (input.points[6].x - input.points[0].x) * Math.max(input.width, 1);
  const axisY =
    (input.points[6].y - input.points[0].y) * Math.max(input.height, 1);
  const direction = input.tipDirection === "up" ? -1 : 1;
  const angle =
    (Math.atan2(-direction * axisX, direction * axisY) * 180) / Math.PI;
  if (Math.abs(angle) > 25)
    return angle > 0
      ? result("rotate_left", "Rotate the nail slightly to the left.", bounds)
      : result(
          "rotate_right",
          "Rotate the nail slightly to the right.",
          bounds,
        );
  const occupancy = Math.max(
    bounds.width / target.width,
    bounds.height / target.height,
  );
  if (occupancy < 0.58)
    return result(
      "closer",
      "Bring the nail a little closer to the camera.",
      bounds,
    );
  if (occupancy > 1.22)
    return result(
      "farther",
      "Move the nail a little farther from the camera.",
      bounds,
    );
  // Framing advice never gates capture: steady off-centre candidates remain usable.
  return result(
    "hold",
    input.steady
      ? "Hold still — you can capture now."
      : "Hold still for a moment.",
    bounds,
  );
}
