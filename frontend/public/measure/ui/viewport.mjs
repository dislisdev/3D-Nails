// Πειραματικό · ζουμ και συντεταγμένες εικόνας · WebApp 0.2.0.
import { clamp, distance, midpoint } from '../core/geometry.mjs';

const MAX_ZOOM = 8;
const ZOOM_STEP = 1.5;
const ZOOM_MIN = 1;

export function viewportFor(state) {
  const { width_px: width, height_px: height } = state.image.info;
  return state.viewport ?? { x: -0.5, y: -0.5, width, height, zoom: ZOOM_MIN };
}

export function zoomViewport(state, zoom, anchor = [0.5, 0.5], destination = anchor) {
  const before = viewportFor(state);
  const { width_px: imageWidth, height_px: imageHeight } = state.image.info;
  zoom = clamp(zoom, ZOOM_MIN, MAX_ZOOM);
  const width = imageWidth / zoom, height = imageHeight / zoom;
  const x = clamp(before.x + anchor[0] * before.width - destination[0] * width, -0.5, imageWidth - width - 0.5);
  const y = clamp(before.y + anchor[1] * before.height - destination[1] * height, -0.5, imageHeight - height - 0.5);
  state.viewport = { x, y, width, height, zoom };
}

export const zoomStep = (state, direction) => zoomViewport(state, viewportFor(state).zoom * ZOOM_STEP ** direction);
export const canZoomIn = state => viewportFor(state).zoom < MAX_ZOOM;
export const canZoomOut = state => viewportFor(state).zoom > ZOOM_MIN;
export const viewBoxFor = ({ x, y, width, height }) => [x, y, width, height].join(' ');

function relativeToStage(box, [x, y]) {
  return [(x - box.left) / box.width, (y - box.top) / box.height];
}

export function imagePointAt(state, box, screen) {
  const view = viewportFor(state);
  const [u, v] = relativeToStage(box, screen);
  return [clamp(view.x + u * view.width, 0, state.image.info.width_px - 1),
    clamp(view.y + v * view.height, 0, state.image.info.height_px - 1)];
}

export function cursorAt(state) {
  const view = viewportFor(state);
  return state.cursor ?? [view.x + view.width / 2, view.y + view.height / 2];
}

export function fitCursor(state) {
  if (!state.cursor) return;
  const { x, y, width, height } = viewportFor(state);
  state.cursor = [clamp(state.cursor[0], Math.max(0, x), Math.min(state.image.info.width_px - 1, x + width)),
    clamp(state.cursor[1], Math.max(0, y), Math.min(state.image.info.height_px - 1, y + height))];
}

export function drawRaster(canvas, source, state) {
  const view = viewportFor(state);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, view.x + 0.5, view.y + 0.5, view.width, view.height, 0, 0, canvas.width, canvas.height);
}

export function bindViewport(root, { getState, select, updateHandle, repaint, tapTolerance }) {
  const touches = new Map();
  let gestured = false;
  let dragged = false;
  let handle = null;
  let handleOffset;
  let downAt;
  const position = event => [event.clientX, event.clientY];
  const current = event => event.target.closest('#image-stage');
  const point = (stage, event) => imagePointAt(getState(), stage.getBoundingClientRect(), position(event));

  root.addEventListener('pointerdown', event => {
    const stage = current(event);
    if (!stage || event.button !== 0 || getState().busy || event.pointerType !== 'touch' && !event.isPrimary) return;
    if (!touches.size) {
      gestured = false;
      dragged = false;
      downAt = position(event);
      const marker = event.target.closest('[data-handle]')?.dataset;
      handle = marker?.handle ?? null;
      if (marker) {
        const coords = [Number(marker.handleX), Number(marker.handleY)];
        const start = point(stage, event);
        handleOffset = start.map((value, i) => Number.isFinite(coords[i]) ? coords[i] - value : 0);
      }
    }
    touches.set(event.pointerId, position(event));
    if (touches.size > 1) {
      gestured = true;
      handle = null;
    }
    stage.setPointerCapture(event.pointerId);
  });

  root.addEventListener('pointermove', event => {
    const stage = current(event);
    if (!stage || !touches.has(event.pointerId)) return;
    const previous = [...touches.values()];
    touches.set(event.pointerId, position(event));
    const next = [...touches.values()];
    if (next.length >= 2) {
      const box = stage.getBoundingClientRect();
      const from = relativeToStage(box, midpoint(...previous));
      const to = relativeToStage(box, midpoint(...next));
      const factor = distance(...next) / Math.max(1, distance(...previous));
      zoomViewport(getState(), viewportFor(getState()).zoom * factor, from, to);
      fitCursor(getState());
      repaint({ raster: true });
    } else if (!gestured && distance(next[0], downAt) > tapTolerance()) {
      dragged = true;
      if (handle) updateHandle(handle, point(stage, event).map((value, i) => value + handleOffset[i]));
    }
  });

  root.addEventListener('pointerup', event => {
    if (!touches.has(event.pointerId)) return;
    const stage = current(event);
    touches.delete(event.pointerId);
    if (!stage || gestured || dragged) return;
    if (handle) stage.querySelector('[data-handle="' + handle + '"]')?.focus({ preventScroll: true });
    else select(point(stage, event));
  });

  for (const type of ['pointercancel', 'lostpointercapture']) {
    root.addEventListener(type, event => touches.delete(event.pointerId));
  }
}
