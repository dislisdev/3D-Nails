import { useId } from "react";
import { t } from "../i18n";
import type { LiveContourState } from "./useLiveContour";
import type { FramingGuidance } from "./liveFramingGuidance";
import "./LiveContour.css";

export default function LiveContourOverlay({
  tracking,
  guidance,
}: {
  tracking: LiveContourState;
  guidance: FramingGuidance;
}) {
  const markerId = "live-framing-arrow-" + useId().replace(/:/g, "");
  if (!tracking.sourceWidth || !tracking.sourceHeight) return null;
  const { sourceWidth: width, sourceHeight: height } = tracking;
  const candidate =
    tracking.result.status === "candidate" ? tracking.result : null;
  const boundary = candidate
    ? candidate.outline.length >= 3
      ? candidate.outline
      : candidate.points
    : [];
  const radius = Math.max(width, height) * 0.004;
  const rect = guidance.target,
    x = rect.x * width,
    y = rect.y * height,
    right = (rect.x + rect.width) * width,
    bottom = (rect.y + rect.height) * height;
  const corner = Math.min(rect.width * width, rect.height * height) * 0.18;
  const targetLines = `M${x + corner} ${y}H${x}V${y + corner} M${right - corner} ${y}H${right}V${y + corner} M${x} ${bottom - corner}V${bottom}H${x + corner} M${right - corner} ${bottom}H${right}V${bottom - corner}`;
  const cross = Math.min(width, height) * 0.025;
  const bounds = guidance.bounds,
    cx = (bounds?.cx ?? 0.5) * width,
    cy = (bounds?.cy ?? 0.5) * height;
  const arrowLength = Math.min(width, height) * 0.13;
  let arrow = "";
  if (bounds) {
    switch (guidance.action) {
      case "move_left":
        arrow = `M${cx} ${cy}h${-arrowLength}`;
        break;
      case "move_right":
        arrow = `M${cx} ${cy}h${arrowLength}`;
        break;
      case "move_up":
        arrow = `M${cx} ${cy}v${-arrowLength}`;
        break;
      case "move_down":
        arrow = `M${cx} ${cy}v${arrowLength}`;
        break;
      case "closer": {
        const d = arrowLength * 0.7;
        arrow = `M${cx - d * 0.25} ${cy - d * 0.25}L${cx - d} ${cy - d} M${cx + d * 0.25} ${cy + d * 0.25}L${cx + d} ${cy + d}`;
        break;
      }
      case "farther": {
        const d = arrowLength * 0.7;
        arrow = `M${cx - d} ${cy - d}L${cx - d * 0.25} ${cy - d * 0.25} M${cx + d} ${cy + d}L${cx + d * 0.25} ${cy + d * 0.25}`;
        break;
      }
      case "rotate_left":
        arrow = `M${cx + arrowLength * 0.7} ${cy + arrowLength * 0.3}A${arrowLength} ${arrowLength} 0 0 0 ${cx - arrowLength * 0.7} ${cy - arrowLength * 0.5}`;
        break;
      case "rotate_right":
        arrow = `M${cx - arrowLength * 0.7} ${cy + arrowLength * 0.3}A${arrowLength} ${arrowLength} 0 0 1 ${cx + arrowLength * 0.7} ${cy - arrowLength * 0.5}`;
        break;
    }
  }
  return (
    <div
      className={`live-contour-overlay ${tracking.steady ? "steady" : "finding"}`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label={t(
          "Live framing guide. Only the detected outline comes from the image.",
        )}
        role="img"
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="7"
            markerHeight="7"
            refX="5.5"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path
              d="M1 1L6 3.5L1 6"
              fill="none"
              stroke="#ffe6ad"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>
        <path
          className="live-framing-target"
          d={targetLines}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="live-framing-crosshair"
          d={`M${width / 2 - cross} ${height / 2}h${cross * 2} M${width / 2} ${height / 2 - cross}v${cross * 2}`}
          vectorEffect="non-scaling-stroke"
        />
        {candidate && (
          <>
            <polygon
              className="live-contour-boundary"
              points={boundary
                .map((point) => `${point.x * width},${point.y * height}`)
                .join(" ")}
              vectorEffect="non-scaling-stroke"
            />
            {candidate.points.map((point, index) => (
              <circle
                key={index}
                cx={point.x * width}
                cy={point.y * height}
                r={radius * (index === 0 || index === 6 ? 1.6 : 1)}
                className={
                  index === 0 || index === 6
                    ? "live-contour-landmark"
                    : "live-contour-point"
                }
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </>
        )}
        {arrow && (
          <path
            className="live-framing-arrow"
            d={arrow}
            markerEnd={`url(#${markerId})`}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}
