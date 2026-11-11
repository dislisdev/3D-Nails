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
  Sparkles,
  Shapes,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { api } from "./types";
import type {
  Session,
  Point,
  Calibration,
  Measurement,
  ContourProposal,
  DesignPreferences,
} from "./types";
import { t, useLanguage, formatNumber } from "./i18n";
import "./ContourAssistance.css";
import NailShapeSelector from "./NailShapeSelector";
import { browserSurfacePoint } from "./browser/geometry";
import { measurePolygon } from "./browser/measurement";

type EditorSnapshot = {
  points: Point[];
  calibration: Calibration;
  proposal: ContourProposal | null;
  approach: "manual" | "automatic";
};

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
    [history, setHistory] = useState<EditorSnapshot[]>([]),
    [reviewed, setReviewed] = useState(false),
    [scaleReviewed, setScaleReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [activeProposal, setActiveProposal] = useState<ContourProposal | null>(
      null,
    ),
    [approach, setApproach] = useState<"manual" | "automatic">("manual"),
    [tipDirection, setTipDirection] = useState<"up" | "down">("up"),
    [detecting, setDetecting] = useState(false),
    [selectedPoint, setSelectedPoint] = useState(0),
    [showDesign, setShowDesign] = useState(false),
    [design, setDesign] = useState<DesignPreferences>(
      session.design ?? { tip_shape: "oval", extension_mm: 2 },
    );
  const analysisVersion = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      analysisVersion.current += 1;
    };
  }, []);
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
    analysisVersion.current += 1;
    setDetecting(false);
    setDesign(
      session.design ?? {
        tip_shape: session.latest_model?.parameters.tip_shape ?? "oval",
        extension_mm: session.latest_model?.parameters.extension_mm ?? 2,
      },
    );
    const hasMeasurement =
      session.measurement?.image_id === image.id &&
      session.contour?.length === 12;
    const savedProposal = hasMeasurement
      ? (session.contour_proposals?.find(
          (proposal) =>
            proposal.id === session.measurement?.contour_proposal_id,
        ) ?? null)
      : (image.contour_proposal ?? null);
    setActiveProposal(savedProposal);
    setApproach(savedProposal ? "automatic" : "manual");
    setTipDirection(savedProposal?.tip_direction ?? "up");
    setPoints(
      hasMeasurement
        ? session.contour!
        : (savedProposal?.points ?? template(image.width, image.height)),
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
  function remember(invalidateAnalysis = true) {
    if (invalidateAnalysis) {
      analysisVersion.current += 1;
      setDetecting(false);
    }
    setHistory((old) => [
      ...old.slice(-39),
      {
        points: points.map((p) => ({ ...p })),
        calibration: {
          ...calibration,
          a: { ...calibration.a },
          b: { ...calibration.b },
        },
        proposal: activeProposal,
        approach,
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
    if (kind === "point") setSelectedPoint(index);
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
    setSelectedPoint(i);
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
    setActiveProposal(latest.proposal);
    setApproach(latest.approach);
    analysisVersion.current += 1;
    setDetecting(false);
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
    setActiveProposal(null);
    setApproach("manual");
    setError("");
  }
  function moveSelected(dx: number, dy: number) {
    remember();
    setPoints((old) =>
      old.map((point, index) =>
        index === selectedPoint
          ? clamp({ x: point.x + dx, y: point.y + dy })
          : point,
      ),
    );
  }
  function setSelectedCoordinate(axis: "x" | "y", value: number) {
    if (!Number.isFinite(value)) return;
    remember();
    setPoints((old) =>
      old.map((point, index) =>
        index === selectedPoint ? clamp({ ...point, [axis]: value }) : point,
      ),
    );
  }
  function backgroundPointerDown(event: PointerEvent<SVGSVGElement>) {
    const position = point(event),
      rect = svg.current!.getBoundingClientRect();
    const factor = Math.min(rect.width / vw, rect.height / vh);
    const handles = points.map((p, index) => ({
      position: p,
      kind: "point" as const,
      index,
      key: "a" as const,
    }));
    const all = [
      ...handles,
      ...(["a", "b"] as const).map((key) => ({
        position: calibration[key],
        kind: "calibration" as const,
        index: 0,
        key,
      })),
    ];
    const nearest = all
      .map((handle) => ({
        ...handle,
        distance:
          Math.hypot(
            handle.position.x - position.x,
            handle.position.y - position.y,
          ) * factor,
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    // Every handle gets a 44px touch area independent of zoom or active tool.
    if (nearest && nearest.distance <= 22) {
      start(event, nearest.kind, nearest.index, nearest.key);
      return;
    }
    if (mode === "pan") start(event, "pan");
    else if (mode === "calibration") {
      remember();
      setCalibration({ ...calibration, [calPoint]: clamp(position) });
      setCalPoint(calPoint === "a" ? "b" : "a");
    }
  }
  async function proposeOutline() {
    const version = ++analysisVersion.current;
    setDetecting(true);
    setError("");
    try {
      const photograph = new Image();
      photograph.src = image!.url;
      await photograph.decode();
      if (!mounted.current || version !== analysisVersion.current) return;
      if (photograph.naturalWidth !== w || photograph.naturalHeight !== h) {
        throw new Error(
          "The stored photograph dimensions changed. Upload it again before detecting a contour.",
        );
      }
      const canvas = document.createElement("canvas");
      const factor = Math.min(1, 384 / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * factor));
      canvas.height = Math.max(1, Math.round(h * factor));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context)
        throw new Error(
          "Image analysis is unavailable in this browser. Continue with manual tracing.",
        );
      context.drawImage(photograph, 0, 0, canvas.width, canvas.height);
      const { detectNailContour } = await import("./vision/nailContour");
      if (!mounted.current || version !== analysisVersion.current) return;
      const result = detectNailContour(
        context.getImageData(0, 0, canvas.width, canvas.height),
        { tipDirection },
      );
      if (result.status !== "candidate") {
        throw new Error(
          "No clear nail outline was found. Improve lighting and framing, or place the control points manually.",
        );
      }
      const candidate = result.points.map((point) => ({
        x: Math.max(0, Math.min(w - 1, point.x * w)),
        y: Math.max(0, Math.min(h - 1, point.y * h)),
      }));
      const proposal = await api<ContourProposal>(
        "/sessions/" + session.id + "/contour-proposals",
        {
          method: "POST",
          body: JSON.stringify({
            image_id: image!.id,
            points: candidate,
            method: result.method,
            source: "photo",
            tip_direction: tipDirection,
          }),
        },
      );
      if (!mounted.current || version !== analysisVersion.current) return;
      remember(false);
      setPoints(proposal.points.map((point) => ({ ...point })));
      setActiveProposal(proposal);
      setApproach("automatic");
      setMode("contour");
    } catch (error) {
      if (mounted.current && version === analysisVersion.current)
        setError(
          error instanceof Error
            ? error.message
            : "Automatic outline detection could not finish. Continue manually.",
        );
    } finally {
      if (mounted.current && version === analysisVersion.current)
        setDetecting(false);
    }
  }
  async function measure() {
    setBusy(true);
    setError("");
    try {
      await api("/sessions/" + session.id, {
        method: "PATCH",
        body: JSON.stringify({ design }),
      });
      await api<Measurement>("/sessions/" + session.id + "/measure", {
        method: "POST",
        body: JSON.stringify({
          image_id: image!.id,
          contour: points,
          calibration: { ...calibration, reference_mm: Number(reference) },
          method: "calibrated_photo",
          ...(activeProposal ? { proposal_id: activeProposal.id } : {}),
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
  const proposalAdjusted =
    !!activeProposal &&
    points.some((point, index) => {
      const original = activeProposal.points[index];
      return (
        !original ||
        Math.hypot(point.x - original.x, point.y - original.y) > 0.01
      );
    });
  let designOutline: Point[] = [],
    designTip: Point | null = null;
  if (
    scale &&
    points.length === 12 &&
    Number.isFinite(design.extension_mm) &&
    design.extension_mm > 0
  ) {
    try {
      const projected = measurePolygon(
        {
          image_id: image.id,
          contour: points,
          calibration: { ...calibration, reference_mm: Number(reference) },
          method: "calibrated_photo",
        },
        w,
        h,
      );
      const parameters = {
        length_mm: projected.length_mm,
        width_mm: projected.width_mm,
        transverse_rise_mm: 0,
        longitudinal_rise_mm: 0,
        thickness_mm: 0.5,
        extension_mm: design.extension_mm,
        tip_shape: design.tip_shape,
        asymmetry_mm: 0,
      };
      const lengthPx = Math.hypot(
        points[6].x - points[0].x,
        points[6].y - points[0].y,
      );
      const along = {
        x: (points[6].x - points[0].x) / lengthPx,
        y: (points[6].y - points[0].y) / lengthPx,
      };
      const across = { x: along.y, y: -along.x };
      const project = (u: number, v: number): Point => {
        const [x, y] = browserSurfacePoint(u, v, parameters);
        return {
          x: points[0].x + (across.x * x + along.x * y) / scale,
          y: points[0].y + (across.y * x + along.y * y) / scale,
        };
      };
      const natural =
        parameters.length_mm / (parameters.length_mm + parameters.extension_mm);
      for (let i = 0; i <= 8; i++)
        designOutline.push(project(-1, natural + ((1 - natural) * i) / 8));
      for (let i = 1; i <= 32; i++)
        designOutline.push(project(-1 + (2 * i) / 32, 1));
      for (let i = 1; i <= 8; i++)
        designOutline.push(project(1, 1 - ((1 - natural) * i) / 8));
      designTip = project(0, 1);
    } catch {
      /* An incomplete/invalid natural contour or scale cannot place a design overlay. */
    }
  }
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
      <section className="outline-assistance" aria-label={t("Outline method")}>
        <div
          className="outline-methods"
          role="group"
          aria-label={t("Outline method")}
        >
          <button
            type="button"
            aria-pressed={approach === "manual"}
            onClick={() => {
              analysisVersion.current += 1;
              setDetecting(false);
              setApproach("manual");
              setMode("contour");
            }}
          >
            <MousePointer2 size={18} />
            <span>
              <strong>{t("Manual tracing")}</strong>
              <small>
                {t("Place or correct the twelve control points yourself.")}
              </small>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={approach === "automatic"}
            disabled={detecting || busy}
            onClick={proposeOutline}
          >
            <Sparkles size={18} />
            <span>
              <strong>
                {t(detecting ? "Finding an outline…" : "Automatic proposal")}
              </strong>
              <small>
                {t(
                  "Analyze this photo locally, then review the suggested outline.",
                )}
              </small>
            </span>
          </button>
        </div>
        <div className="outline-tip-label">
          <label htmlFor="outline-tip-direction">
            {t("Free-edge direction for detection")}
          </label>
          <select
            id="outline-tip-direction"
            value={tipDirection}
            disabled={detecting || busy}
            onChange={(event) =>
              setTipDirection(event.target.value as "up" | "down")
            }
          >
            <option value="up">{t("Free edge at the top")}</option>
            <option value="down">{t("Free edge at the bottom")}</option>
          </select>
        </div>
        <p>
          {t(
            "Contrast-based detection is experimental. It may miss the boundary or select the wrong region. Check every point; this does not measure curvature or establish fit.",
          )}
        </p>
        <div className="outline-origin" role="status">
          {t(
            activeProposal
              ? proposalAdjusted
                ? "Origin: automatic proposal with your manual corrections."
                : "Origin: automatic proposal awaiting human review."
              : "Origin: manually placed control points.",
          )}
        </div>
      </section>
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
              <button
                type="button"
                aria-expanded={showDesign}
                aria-controls="outline-design-settings"
                onClick={() => setShowDesign(!showDesign)}
              >
                <Shapes size={16} />
                {t("Nail shape")}
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
          {showDesign && (
            <section
              id="outline-design-settings"
              className="outline-design-settings"
            >
              <NailShapeSelector
                value={design.tip_shape}
                disabled={busy || detecting}
                onChange={(tip_shape) => setDesign({ ...design, tip_shape })}
              />
              <label htmlFor="outline-extension-length">
                {t("Added free-edge length")}
                <div className="number-input">
                  <input
                    id="outline-extension-length"
                    type="number"
                    min="0"
                    max="15"
                    step="0.1"
                    value={
                      Number.isFinite(design.extension_mm)
                        ? design.extension_mm
                        : ""
                    }
                    onChange={(event) =>
                      setDesign({
                        ...design,
                        extension_mm: event.target.valueAsNumber,
                      })
                    }
                  />
                  <span>mm</span>
                </div>
              </label>
              <p>
                {t(
                  "Shape changes the added design edge only. D marks the natural nail edge; T marks the design tip. Your measured natural contour is not reshaped.",
                )}
              </p>
              <p>
                {t(
                  designOutline.length
                    ? "The dashed edge is a 2D design preview using your calibration. Shape preferences are saved with the measurement."
                    : "Place the natural outline and establish a scale to position the added design edge. Set a length above zero to preview a tip shape.",
                )}
              </p>
            </section>
          )}
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
              onPointerDown={backgroundPointerDown}
            >
              <image href={image.url} width={w} height={h} />
              {showDesign && designOutline.length > 0 && (
                <polygon
                  className="free-edge-design-preview"
                  data-design-shape={design.tip_shape}
                  points={designOutline.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="#d6b69a"
                  fillOpacity=".2"
                  stroke="#e4bd86"
                  strokeWidth={r * 0.4}
                  strokeDasharray={`${r * 1.5} ${r * 0.7}`}
                  pointerEvents="none"
                />
              )}
              {showDesign && designTip && (
                <g pointerEvents="none">
                  <circle
                    cx={designTip.x}
                    cy={designTip.y}
                    r={r * 1.2}
                    fill="#e7cbb2"
                    stroke="#242127"
                    strokeWidth={r * 0.16}
                  />
                  <text
                    x={designTip.x}
                    y={designTip.y + r * 0.35}
                    fontSize={r * 0.95}
                    textAnchor="middle"
                    fill="#242127"
                    fontFamily="Arial"
                  >
                    T
                  </text>
                </g>
              )}
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
                    r={r * (i % 3 === 0 ? 1.4 : 1.15)}
                    className={
                      "contour-handle " + (i % 3 === 0 ? "landmark" : "")
                    }
                    fill={i === 0 ? "#b27a86" : i === 6 ? "#e7cbb2" : "#faf8f5"}
                    stroke={selectedPoint === i ? "#a55772" : "#242127"}
                    strokeWidth={r * (selectedPoint === i ? 0.3 : 0.16)}
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
                      start(e, "point", i);
                    }}
                    onFocus={() => setSelectedPoint(i)}
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
                    onPointerDown={(e) => start(e, "calibration", 0, key)}
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
          <details className="point-adjustments">
            <summary>{t("Precise adjustment of every point")}</summary>
            <label htmlFor="selected-contour-point">
              {t("Selected point")}
            </label>
            <select
              id="selected-contour-point"
              value={selectedPoint}
              onChange={(event) => setSelectedPoint(Number(event.target.value))}
            >
              {points.map((_, index) => (
                <option key={index} value={index}>
                  {label(index)}
                </option>
              ))}
            </select>
            <div
              className="point-nudge-controls"
              role="group"
              aria-label={t("Move the selected contour point")}
            >
              <button
                type="button"
                aria-label={t("Move point left")}
                onClick={() => moveSelected(-1, 0)}
              >
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                aria-label={t("Move point up")}
                onClick={() => moveSelected(0, -1)}
              >
                <ArrowUp size={18} />
              </button>
              <button
                type="button"
                aria-label={t("Move point down")}
                onClick={() => moveSelected(0, 1)}
              >
                <ArrowDown size={18} />
              </button>
              <button
                type="button"
                aria-label={t("Move point right")}
                onClick={() => moveSelected(1, 0)}
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <div className="point-coordinate-inputs">
              {(["x", "y"] as const).map((axis) => (
                <label key={axis} htmlFor={`contour-coordinate-${axis}`}>
                  {t(
                    axis === "x"
                      ? "Horizontal image position"
                      : "Vertical image position",
                  )}
                  <input
                    id={`contour-coordinate-${axis}`}
                    type="number"
                    min="0"
                    max={axis === "x" ? w - 1 : h - 1}
                    step="any"
                    value={points[selectedPoint]?.[axis] ?? 0}
                    onChange={(event) =>
                      setSelectedCoordinate(axis, event.target.valueAsNumber)
                    }
                  />
                </label>
              ))}
            </div>
            <p>
              {t(
                "Coordinates are original-image pixels, not millimeters. Drag any point even in Pan mode; drag the background to move the image.",
              )}
            </p>
          </details>
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
                  : activeProposal
                    ? "This outline was proposed from image contrast. Confirm its cuticle, sidewalls and free edge before measuring."
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
              disabled={detecting || busy}
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
            disabled={
              !reviewed || !scaleReviewed || !scale || busy || detecting
            }
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
