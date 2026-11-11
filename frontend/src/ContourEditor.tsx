import { useEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent } from "react";
import {
  ScanLine,
  Undo2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Move,
  ArrowRight,
  Check,
  AlertCircle,
  SlidersHorizontal,
  MousePointer2,
} from "lucide-react";
import { api } from "./types";
import type { Session, Point, Calibration, Measurement } from "./types";
import { t, useLanguage, formatNumber } from "./i18n";

function template(w: number, h: number): Point[] {
  return [
    [0.5, 0.25],
    [0.62, 0.25],
    [0.69, 0.32],
    [0.7, 0.47],
    [0.68, 0.63],
    [0.61, 0.75],
    [0.5, 0.79],
    [0.39, 0.75],
    [0.32, 0.63],
    [0.3, 0.47],
    [0.31, 0.32],
    [0.38, 0.25],
  ].map(([x, y]) => ({ x: x * w, y: y * h }));
}
function label(i: number) {
  return i === 0
    ? t("Cuticle midpoint")
    : i === 3
      ? t("Right sidewall")
      : i === 6
        ? t("Distal midpoint")
        : i === 9
          ? t("Left sidewall")
          : t("Contour point {n}", { n: formatNumber(i + 1, 0) });
}
export default function ContourEditor({
  session,
  onMeasured,
}: {
  session: Session;
  onMeasured: () => Promise<void>;
}) {
  useLanguage();
  const image = session.images?.filter((i) => i.view === "top").at(-1);
  const [points, setPoints] = useState<Point[]>([]),
    [calibration, setCalibration] = useState<Calibration>({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
      reference_mm: 0,
    }),
    [reference, setReference] = useState(""),
    [mode, setMode] = useState<"contour" | "calibration" | "pan">("contour"),
    [calPoint, setCalPoint] = useState<"a" | "b">("a"),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [history, setHistory] = useState<
      { points: Point[]; calibration: Calibration }[]
    >([]),
    [reviewed, setReviewed] = useState(false),
    [scaleReviewed, setScaleReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{
      kind: "point" | "calibration" | "pan";
      index: number;
      key: "a" | "b";
      start: Point;
      pan: Point;
    } | null>(null);
  useEffect(() => {
    if (!image) return;
    setPoints(
      session.measurement?.image_id === image.id &&
        session.contour?.length === 12
        ? session.contour
        : template(image.width, image.height),
    );
    const c =
      session.measurement?.image_id === image.id && session.calibration
        ? session.calibration
        : {
            a: { x: image.width * 0.15, y: image.height * 0.9 },
            b: { x: image.width * 0.45, y: image.height * 0.9 },
            reference_mm: 0,
          };
    setCalibration(c);
    setReference(c.reference_mm ? String(c.reference_mm) : "");
    setReviewed(false);
    setScaleReviewed(false);
    setHistory([]);
    setDirty(false);
  }, [image?.id, session.id]);
  if (!image)
    return (
      <div className="empty-state">
        <ScanLine size={38} strokeWidth={1} />
        <h2>{t("A photograph comes first.")}</h2>
        <p>
          {t(
            "Upload or capture a top view in the Capture step. Include a reference whose physical size you know.",
          )}
        </p>
      </div>
    );
  const w = image.width,
    h = image.height,
    vw = w / zoom,
    vh = h / zoom,
    vx = (w - vw) / 2 + pan.x,
    vy = (h - vh) / 2 + pan.y,
    r = Math.max(w, h) / 100 / zoom;
  function point(event: PointerEvent<SVGElement>): Point {
    const rect = svg.current!.getBoundingClientRect();
    const scale = Math.min(rect.width / vw, rect.height / vh),
      offsetX = (rect.width - vw * scale) / 2,
      offsetY = (rect.height - vh * scale) / 2;
    return {
      x: vx + (event.clientX - rect.left - offsetX) / scale,
      y: vy + (event.clientY - rect.top - offsetY) / scale,
    };
  }
  function clamp(p: Point) {
    return {
      x: Math.max(0, Math.min(w - 1, p.x)),
      y: Math.max(0, Math.min(h - 1, p.y)),
    };
  }
  function remember() {
    setHistory((old) => [
      ...old.slice(-39),
      {
        points: points.map((p) => ({ ...p })),
        calibration: {
          ...calibration,
          a: { ...calibration.a },
          b: { ...calibration.b },
        },
      },
    ]);
    setReviewed(false);
    setScaleReviewed(false);
    setDirty(true);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const p = point(event),
      d = drag.current;
    if (d.kind === "point") {
      setPoints((old) => old.map((v, i) => (i === d.index ? clamp(p) : v)));
    } else if (d.kind === "calibration") {
      setCalibration((old) => ({ ...old, [d.key]: clamp(p) }));
    } else {
      const rect = svg.current!.getBoundingClientRect(),
        factor = Math.min(rect.width / vw, rect.height / vh);
      setPan({
        x: d.pan.x - (event.clientX - d.start.x) / factor,
        y: d.pan.y - (event.clientY - d.start.y) / factor,
      });
    }
  }
  function start(
    event: PointerEvent<SVGElement>,
    kind: "point" | "calibration" | "pan",
    index = 0,
    key: "a" | "b" = "a",
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (kind !== "pan") remember();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind,
      index,
      key,
      start: { x: event.clientX, y: event.clientY },
      pan,
    };
  }
  function keyboard(event: KeyboardEvent<SVGCircleElement>, i: number) {
    const delta = event.shiftKey ? 10 : 1;
    const dirs: Record<string, Point> = {
      ArrowLeft: { x: -delta, y: 0 },
      ArrowRight: { x: delta, y: 0 },
      ArrowUp: { x: 0, y: -delta },
      ArrowDown: { x: 0, y: delta },
    };
    if (!dirs[event.key]) return;
    event.preventDefault();
    remember();
    const d = dirs[event.key];
    setPoints((old) =>
      old.map((p, index) =>
        index === i ? clamp({ x: p.x + d.x, y: p.y + d.y }) : p,
      ),
    );
  }
  function calibrationKeyboard(
    event: KeyboardEvent<SVGCircleElement>,
    key: "a" | "b",
  ) {
    const step = event.shiftKey ? 10 : 1;
    const directions: Record<string, Point> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    remember();
    setCalibration((old) => ({
      ...old,
      [key]: clamp({ x: old[key].x + delta.x, y: old[key].y + delta.y }),
    }));
  }
  function undo() {
    const latest = history.at(-1);
    if (!latest) return;
    setPoints(latest.points);
    setCalibration(latest.calibration);
    setReference(
      latest.calibration.reference_mm
        ? String(latest.calibration.reference_mm)
        : reference,
    );
    setHistory(history.slice(0, -1));
    setReviewed(false);
    setScaleReviewed(false);
    setDirty(true);
  }
  function reset() {
    remember();
    setPoints(template(w, h));
    setError("");
  }
  async function measure() {
    setBusy(true);
    setError("");
    try {
      await api<Measurement>("/sessions/" + session.id + "/measure", {
        method: "POST",
        body: JSON.stringify({
          image_id: image!.id,
          contour: points,
          calibration: { ...calibration, reference_mm: Number(reference) },
          method: "calibrated_photo",
        }),
      });
      setDirty(false);
      await onMeasured();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Measurement could not be completed. Review the outline and scale.",
      );
    } finally {
      setBusy(false);
    }
  }
  const distance = Math.hypot(
      calibration.b.x - calibration.a.x,
      calibration.b.y - calibration.a.y,
    ),
    scale =
      Number(reference) > 0 && distance > 0 ? Number(reference) / distance : 0;
  return (
    <>
      <div className="step-intro">
        <div>
          <div className="eyebrow">{t("02 / CALIBRATE & TRACE")}</div>
          <h2>
            {t("Observe the edges.")}
            <br />
            <em>{t("Give the image a scale.")}</em>
          </h2>
        </div>
        <p>
          {t(
            "Place the two scale points on a known reference. Then move all twelve outline points onto the visible nail boundary, starting with the cuticle.",
          )}
        </p>
      </div>
      <div className="editor-layout">
        <div className="editor-main">
          <div className="editor-toolbar">
            <div className="segmented-control">
              <button
                className={mode === "contour" ? "active" : ""}
                onClick={() => setMode("contour")}
              >
                <MousePointer2 size={15} />
                {t("Outline")}
              </button>
              <button
                className={mode === "calibration" ? "active" : ""}
                onClick={() => setMode("calibration")}
              >
                <SlidersHorizontal size={15} />
                {t("Scale")}
              </button>
              <button
                className={mode === "pan" ? "active" : ""}
                onClick={() => setMode("pan")}
                aria-label={t("Pan image")}
              >
                <Move size={16} />
              </button>
            </div>
            <div className="editor-tool-icons">
              <button
                className="icon-button"
                aria-label={t("Undo contour adjustment")}
                disabled={!history.length}
                onClick={undo}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-button"
                aria-label={t("Reset outline to manual template")}
                onClick={reset}
              >
                <RotateCcw size={16} />
              </button>
              <span />
              <button
                className="icon-button"
                aria-label={t("Zoom out")}
                disabled={zoom <= 1}
                onClick={() => {
                  setZoom(Math.max(1, zoom - 0.5));
                  setPan({ x: 0, y: 0 });
                }}
              >
                <ZoomOut size={17} />
              </button>
              <span className="zoom-value">
                {formatNumber(Math.round(zoom * 100), 0)}%
              </span>
              <button
                className="icon-button"
                aria-label={t("Zoom in")}
                disabled={zoom >= 4}
                onClick={() => setZoom(Math.min(4, zoom + 0.5))}
              >
                <ZoomIn size={17} />
              </button>
            </div>
          </div>
          <div className={"image-editor " + mode}>
            <svg
              ref={svg}
              viewBox={`${vx} ${vy} ${vw} ${vh}`}
              role="group"
              aria-label={t(
                "Nail boundary editor with twelve draggable control points and two calibration points",
              )}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onPointerDown={(event) => {
                if (mode === "pan") {
                  start(event, "pan");
                } else if (mode === "calibration") {
                  remember();
                  setCalibration({
                    ...calibration,
                    [calPoint]: clamp(point(event)),
                  });
                  setCalPoint(calPoint === "a" ? "b" : "a");
                }
              }}
            >
              <image href={image.url} width={w} height={h} />
              <polygon
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="#c88f9a"
                fillOpacity=".16"
                stroke="#fff8f0"
                strokeWidth={r * 0.38}
                strokeLinejoin="round"
              />
              {points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r * (i % 3 === 0 ? 1.15 : 0.85)}
                    className={
                      "contour-handle " + (i % 3 === 0 ? "landmark" : "")
                    }
                    fill={i === 0 ? "#b27a86" : i === 6 ? "#e7cbb2" : "#faf8f5"}
                    stroke="#242127"
                    strokeWidth={r * 0.16}
                    tabIndex={0}
                    role="slider"
                    aria-label={label(i)}
                    aria-valuetext={t("Image pixel {x}, {y}", {
                      x: formatNumber(p.x, 0),
                      y: formatNumber(p.y, 0),
                    })}
                    aria-valuemin={0}
                    aria-valuemax={w}
                    aria-valuenow={Math.round(p.x)}
                    onKeyDown={(e) => keyboard(e, i)}
                    onPointerDown={(e) => {
                      if (mode !== "pan") start(e, "point", i);
                    }}
                  />
                  {i % 3 === 0 && (
                    <text
                      x={p.x}
                      y={p.y + r * 0.37}
                      fontSize={r * 0.95}
                      textAnchor="middle"
                      fill={i === 0 ? "#fff" : "#242127"}
                      pointerEvents="none"
                      fontFamily="Arial"
                    >
                      {i === 0 ? "C" : i === 3 ? "R" : i === 6 ? "D" : "L"}
                    </text>
                  )}
                </g>
              ))}
              <line
                x1={calibration.a.x}
                y1={calibration.a.y}
                x2={calibration.b.x}
                y2={calibration.b.y}
                stroke="#f2d3a8"
                strokeWidth={r * 0.4}
                strokeDasharray={`${r} ${r * 0.5}`}
              />
              {(["a", "b"] as const).map((key) => (
                <g key={key}>
                  <circle
                    cx={calibration[key].x}
                    cy={calibration[key].y}
                    r={r * 1.05}
                    fill="#f2d3a8"
                    stroke="#242127"
                    strokeWidth={r * 0.16}
                    tabIndex={0}
                    role="slider"
                    aria-label={t("Calibration point {point}", {
                      point: key.toUpperCase(),
                    })}
                    aria-valuemin={0}
                    aria-valuemax={w - 1}
                    aria-valuenow={Math.round(calibration[key].x)}
                    aria-valuetext={t("Image pixel {x}, {y}", {
                      x: formatNumber(calibration[key].x, 0),
                      y: formatNumber(calibration[key].y, 0),
                    })}
                    onKeyDown={(e) => calibrationKeyboard(e, key)}
                    onPointerDown={(e) =>
                      start(e, mode === "pan" ? "pan" : "calibration", 0, key)
                    }
                  />
                  <text
                    x={calibration[key].x}
                    y={calibration[key].y - r * 1.8}
                    fill="#fff"
                    fontSize={r * 1.3}
                    fontFamily="Arial"
                    textAnchor="middle"
                    stroke="#242127"
                    strokeWidth={r * 0.04}
                  >
                    {key.toUpperCase()}
                  </text>
                </g>
              ))}
            </svg>
            <div className="editor-image-label">
              {t("ORIGINAL IMAGE · {width} × {height} PX", {
                width: formatNumber(w, 0),
                height: formatNumber(h, 0),
              })}
            </div>
          </div>
          <div className="editor-legend">
            <span>
              <i className="rose-dot" />
              {t("C · cuticle")}
            </span>
            <span>{t("L / R · sidewalls")}</span>
            <span>
              <i className="champagne-dot" />
              {t("D · distal edge")}
            </span>
            <span>
              <i className="gold-line" />
              {t("A — B · scale reference")}
            </span>
          </div>
          <p className="editor-keyboard">
            {t(
              "Drag a point, or focus it and use arrow keys. Shift + arrow moves 10 image pixels. Use Pan mode to move the zoomed image.",
            )}
          </p>
          <div className="template-notice">
            <AlertCircle size={16} />
            <span>
              {t(
                dirty
                  ? "Unsaved manual adjustments. Previous measurements refer to the last saved contour."
                  : session.measurement?.image_id === image.id
                    ? "Saved manually reviewed contour. Changes require a new measurement review."
                    : "This starts as a manual template, not automatic nail detection. Review every point.",
              )}
            </span>
          </div>
        </div>
        <aside className="calibration-panel">
          <span className="eyebrow">{t("A / CALIBRATED PHOTOGRAPH")}</span>
          <h3>{t("First, the reference.")}</h3>
          <p>
            {t(
              "Use a dimension independently known in millimeters. Place A and B at its exact endpoints.",
            )}
          </p>
          <div className="reference-buttons">
            <button
              className={
                mode === "calibration" && calPoint === "a" ? "active" : ""
              }
              onClick={() => {
                setMode("calibration");
                setCalPoint("a");
              }}
            >
              {t("Set A · start")}
            </button>
            <button
              className={
                mode === "calibration" && calPoint === "b" ? "active" : ""
              }
              onClick={() => {
                setMode("calibration");
                setCalPoint("b");
              }}
            >
              {t("Set B · end")}
            </button>
          </div>
          <label className="field-label" htmlFor="reference-size">
            {t("Known reference length")}
          </label>
          <div className="number-input">
            <input
              id="reference-size"
              type="number"
              min="1"
              max="200"
              step="any"
              value={reference}
              placeholder={t("e.g. 10")}
              onChange={(e) => {
                setReference(e.target.value);
                setCalibration({
                  ...calibration,
                  reference_mm: Number(e.target.value),
                });
                setScaleReviewed(false);
                setReviewed(false);
                setDirty(true);
              }}
            />
            <span>mm</span>
          </div>
          <p className="field-help">
            {scale
              ? t("{distance} image px · {scale} mm / image px", {
                  distance: formatNumber(distance, 1),
                  scale: formatNumber(scale, 5),
                })
              : t("No physical scale established yet.")}
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={scaleReviewed}
              onChange={(e) => setScaleReviewed(e.target.checked)}
            />
            <span>
              {t(
                "I placed the scale on the known-size reference and kept it approximately in the nail plane.",
              )}
            </span>
          </label>
          <div className="panel-divider" />
          <h3>{t("Then, the outline.")}</h3>
          <p>
            {t(
              "Align C with the cuticle midpoint and D with the distal midpoint. Follow the boundary clockwise. R and L mark the sidewalls.",
            )}
          </p>
          <button className="text-button" onClick={() => setMode("contour")}>
            {t("Edit the twelve control points")} <ArrowRight size={15} />
          </button>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>
              {t(
                "I have manually reviewed all twelve boundary points and the cuticle-to-distal direction.",
              )}
            </span>
          </label>
          <div className="soft-note">
            <AlertCircle size={16} />
            <p>
              {t(
                "This yields projected 2D dimensions. A two-point reference does not correct perspective or recover surface curvature.",
              )}
            </p>
          </div>
          {error && (
            <div className="error-notice" role="alert">
              <AlertCircle size={17} />
              <span>{t(error)}</span>
            </div>
          )}
          <button
            className="button primary full"
            disabled={!reviewed || !scaleReviewed || !scale || busy}
            onClick={measure}
          >
            {busy ? (
              <>
                <span className="spinner" />
                {t("Measuring…")}
              </>
            ) : (
              <>
                {t("Save & measure")} <Check size={17} />
              </>
            )}
          </button>
          <p className="fine-print">
            {t(
              "The contour, scale, and measurement provenance are saved as a research version.",
            )}
          </p>
        </aside>
      </div>
    </>
  );
}
