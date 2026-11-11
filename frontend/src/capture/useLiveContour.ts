import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { detectNailContour } from "../vision/nailContour";
import type {
  DetectionResult,
  NormalizedPoint,
  TipDirection,
} from "../vision/nailContour";

const FRAME_INTERVAL_MS = 225;
const ANALYSIS_LONG_EDGE = 360;
const STABLE_FRAME_COUNT = 3;
const unavailable = (reason: string): DetectionResult => ({
  status: "unavailable",
  method: "contrast_outline_v1",
  reason,
});

export type LiveContourState = {
  result: DetectionResult;
  steady: boolean;
  consistentFrames: number;
  sourceWidth: number;
  sourceHeight: number;
  paused: boolean;
};

function emptyState(
  reason = "Open the camera to start live outline analysis.",
): LiveContourState {
  return {
    result: unavailable(reason),
    steady: false,
    consistentFrames: 0,
    sourceWidth: 0,
    sourceHeight: 0,
    paused: false,
  };
}

function analysisSize(width: number, height: number) {
  const scale = Math.min(1, ANALYSIS_LONG_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Analyze the supplied frozen frame, never a previous live-preview result. */
export function detectCapturedCanvas(
  canvas: HTMLCanvasElement,
  tipDirection: TipDirection,
): DetectionResult {
  if (!canvas.width || !canvas.height)
    return unavailable("A valid camera frame is not available yet.");
  const size = analysisSize(canvas.width, canvas.height);
  const sample = document.createElement("canvas");
  sample.width = size.width;
  sample.height = size.height;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context)
    return unavailable("Local image analysis is unavailable. Use manual mode.");
  context.drawImage(canvas, 0, 0, size.width, size.height);
  return detectNailContour(
    context.getImageData(0, 0, size.width, size.height),
    { tipDirection },
  );
}

function consistent(current: NormalizedPoint[], previous: NormalizedPoint[]) {
  if (current.length !== 12 || previous.length !== 12) return false;
  const shifts = current.map((point, index) =>
    Math.hypot(point.x - previous[index].x, point.y - previous[index].y),
  );
  return (
    shifts.reduce((sum, value) => sum + value, 0) / shifts.length <= 0.025 &&
    Math.max(...shifts) <= 0.06
  );
}

/** Throttled, image-derived suggestions. Stability is temporal consistency, not accuracy. */
export function useLiveContour(
  video: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  tipDirection: TipDirection,
  resetKey: string,
): LiveContourState {
  const [visible, setVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const configuration = `${enabled}:${visible}:${tipDirection}:${resetKey}`;
  const [snapshot, setSnapshot] = useState<{
    configuration: string;
    value: LiveContourState;
  }>(() => ({ configuration: "", value: emptyState() }));
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous: NormalizedPoint[] | null = null;
    let count = 0;
    let lastVideoTime = -1;
    let lastNewFrameAt = performance.now();
    const commit = (value: LiveContourState) => {
      if (!cancelled) setSnapshot({ configuration, value });
    };
    commit(
      emptyState(
        !visible
          ? "Live analysis is paused while this tab is hidden."
          : enabled
            ? "Looking for one visible nail boundary."
            : "Open the camera to start live outline analysis.",
      ),
    );
    if (!enabled || !visible) return;
    const sample = document.createElement("canvas");
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) {
      commit(
        emptyState("Local image analysis is unavailable. Use manual mode."),
      );
      return;
    }
    const clear = (reason: string, paused = false) => {
      previous = null;
      count = 0;
      const current = video.current;
      commit({
        ...emptyState(reason),
        paused,
        sourceWidth: current?.videoWidth ?? 0,
        sourceHeight: current?.videoHeight ?? 0,
      });
    };
    const lost = () =>
      clear("Camera preview is paused. Waiting for a fresh frame.", true);
    const element = video.current;
    element?.addEventListener("waiting", lost);
    element?.addEventListener("pause", lost);
    element?.addEventListener("ended", lost);
    element?.addEventListener("emptied", lost);

    const tick = () => {
      if (cancelled) return;
      const startedAt = performance.now();
      const current = video.current;
      if (
        !current ||
        !current.srcObject ||
        (current.srcObject as MediaStream).active === false ||
        current.readyState < 2 ||
        current.paused ||
        !current.videoWidth ||
        !current.videoHeight
      ) {
        clear("A valid camera frame is not available yet.");
      } else if (current.currentTime === lastVideoTime) {
        if (performance.now() - lastNewFrameAt >= 650) lost();
      } else {
        lastVideoTime = current.currentTime;
        lastNewFrameAt = performance.now();
        const size = analysisSize(current.videoWidth, current.videoHeight);
        sample.width = size.width;
        sample.height = size.height;
        try {
          context.drawImage(current, 0, 0, size.width, size.height);
          const result = detectNailContour(
            context.getImageData(0, 0, size.width, size.height),
            { tipDirection },
          );
          if (result.status === "candidate") {
            count =
              previous && consistent(result.points, previous)
                ? Math.min(STABLE_FRAME_COUNT, count + 1)
                : 1;
            previous = result.points;
            commit({
              result,
              steady: count >= STABLE_FRAME_COUNT,
              consistentFrames: count,
              sourceWidth: current.videoWidth,
              sourceHeight: current.videoHeight,
              paused: false,
            });
          } else clear(result.reason);
        } catch {
          clear("Local image analysis is unavailable. Use manual mode.");
        }
      }
      if (!cancelled)
        timer = setTimeout(
          tick,
          Math.max(0, FRAME_INTERVAL_MS - (performance.now() - startedAt)),
        );
    };
    timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      element?.removeEventListener("waiting", lost);
      element?.removeEventListener("pause", lost);
      element?.removeEventListener("ended", lost);
      element?.removeEventListener("emptied", lost);
    };
  }, [enabled, visible, tipDirection, resetKey, video, configuration]);

  // Do not display a result from the previous camera, direction, tab visibility or mode,
  // even in the render before the new effect has run.
  return snapshot.configuration === configuration
    ? snapshot.value
    : emptyState(
        !visible
          ? "Live analysis is paused while this tab is hidden."
          : enabled
            ? "Looking for one visible nail boundary."
            : "Open the camera to start live outline analysis.",
      );
}
