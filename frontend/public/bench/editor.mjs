const MIN_SCALE_MULTIPLIER = 1;
const MAX_SCREEN_PIXELS_PER_PIXEL = 8;

const KEYS = new Map([
  ['ArrowLeft', [-1, 0]], ['ArrowRight', [1, 0]], ['ArrowUp', [0, -1]], ['ArrowDown', [0, 1]],
]);
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const copyPoints = list => list.map(point => point && [...point]);

export function createEditor(canvas, onChange) {
  const context = canvas.getContext('2d');
  const pointers = new Map();
  let photo = null;
  let preview = null;
  let mode = 'cornersPx';
  let cursor = null;
  let selection = null;
  let action = null;
  let pinch = null;
  let sequencePinched = false;
  let locked = false;
  let paintPending = false;
  let viewport = { width: 0, height: 0 };
  let scale = 1;
  let fitScale = 1;
  let offset = [0, 0];

  function changed(pointsChanged = false) {
    schedulePaint();
    onChange(pointsChanged);
  }

  function schedulePaint() {
    if (paintPending) return;
    paintPending = true;
    requestAnimationFrame(() => {
      paintPending = false;
      paint();
    });
  }

  function token(style, name) {
    const value = style.getPropertyValue(name).trim();
    return parseFloat(value) * (value.endsWith('rem') ? parseFloat(getComputedStyle(document.documentElement).fontSize) : 1);
  }

  function toImage([x, y]) {
    return [(x - offset[0]) / scale, (y - offset[1]) / scale];
  }

  function toScreen([x, y]) {
    return [x * scale + offset[0], y * scale + offset[1]];
  }

  function boundPoint([x, y]) {
    return [clamp(x, 0, photo.width), clamp(y, 0, photo.height)];
  }

  function inside([x, y]) {
    return x >= 0 && x <= photo.width && y >= 0 && y <= photo.height;
  }

  function center() {
    return [viewport.width / 2, viewport.height / 2];
  }

  function maxScale() {
    return Math.max(MAX_SCREEN_PIXELS_PER_PIXEL, fitScale * MIN_SCALE_MULTIPLIER);
  }

  function limitOffset(value, available, imageSize) {
    const rendered = imageSize * scale;
    return rendered <= available ? (available - rendered) / 2 : clamp(value, available - rendered, 0);
  }

  function place(screen, image) {
    offset = [
      limitOffset(screen[0] - image[0] * scale, viewport.width, photo.width),
      limitOffset(screen[1] - image[1] * scale, viewport.height, photo.height),
    ];
  }

  function fit() {
    if (!preview || viewport.width === 0) return;
    scale = fitScale;
    place(center(), [photo.width / 2, photo.height / 2]);
    changed();
  }

  function zoomBy(factor) {
    if (!preview) return;
    const pointOfInterest = selection === null ? cursor : photo[mode][selection];
    const [x, y] = toScreen(pointOfInterest);
    const anchor = x >= 0 && y >= 0 && x <= viewport.width && y <= viewport.height ? [x, y] : center();
    const point = toImage(anchor);
    scale = clamp(scale * factor, fitScale, maxScale());
    place(anchor, point);
    changed();
  }

  function panBy(x, y) {
    if (!preview) return;
    place([offset[0] - x * viewport.width / 3, offset[1] - y * viewport.height / 3], [0, 0]);
    changed();
  }

  function keepVisible(point) {
    const [x, y] = toScreen(point);
    if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) place(center(), point);
  }

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const oldCenter = toImage(center());
    const zoom = scale / fitScale;
    viewport = { width, height };
    const density = globalThis.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * density));
    canvas.height = Math.max(1, Math.round(height * density));
    if (preview) {
      fitScale = Math.min(width / photo.width, height / photo.height, 1);
      scale = clamp(fitScale * zoom, fitScale, maxScale());
      place(center(), oldCenter);
    }
    schedulePaint();
  }

  function traced(draw, ink, halo, stroke, haloStroke) {
    context.beginPath();
    draw();
    context.strokeStyle = halo;
    context.lineWidth = haloStroke;
    context.stroke();
    context.strokeStyle = ink;
    context.lineWidth = stroke;
    context.stroke();
  }

  function drawMarks(style) {
    const ink = style.getPropertyValue('--color-overlay-ink');
    const halo = style.getPropertyValue('--color-overlay-halo');
    const selectedInk = style.getPropertyValue('--color-overlay-selected');
    const stroke = token(style, '--size-stroke-mark');
    const haloStroke = token(style, '--size-stroke-halo');
    const markSize = token(style, '--size-arc-handle-visible');
    context.font = `${style.getPropertyValue('--weight-bold')} ${style.getPropertyValue('--text-sm')} ${style.getPropertyValue('--font-sans')}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const [index, point] of photo[mode].entries()) {
      if (!point) continue;
      const active = selection === index;
      const shown = active && action?.type === 'drag' ? action.point : point;
      const [x, y] = toScreen(shown);
      const color = active ? selectedInk : ink;
      const radius = markSize / (active ? 3 : 4);
      traced(() => context.arc(x, y, radius, 0, 2 * Math.PI), color, halo, stroke, haloStroke);
      const label = mode === 'cornersPx' ? String(index + 1)
        : index === 0 ? 'Α' : index === photo.edgePx.length - 1 ? 'Β' : String(index + 1);
      context.lineWidth = haloStroke;
      context.strokeStyle = halo;
      context.fillStyle = color;
      context.strokeText(label, x, y - markSize / 2);
      context.fillText(label, x, y - markSize / 2);
    }
    if (selection === null && document.activeElement === canvas) {
      const [x, y] = toScreen(cursor);
      const arm = markSize / 2;
      traced(() => {
        context.moveTo(x - arm, y);
        context.lineTo(x + arm, y);
        context.moveTo(x, y - arm);
        context.lineTo(x, y + arm);
      }, selectedInk, halo, stroke, haloStroke);
    }
  }

  function paint() {
    if (!context || viewport.width === 0 || viewport.height === 0) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!preview) return;
    context.scale(canvas.width / viewport.width, canvas.height / viewport.height);
    context.save();
    context.translate(...offset);
    context.scale(scale, scale);
    context.transform(...preview.transform);
    context.drawImage(preview.image, 0, 0);
    context.restore();
    drawMarks(getComputedStyle(canvas));
  }

  function setPhoto(next, drawable) {
    photo = next;
    preview = drawable;
    action = null;
    pinch = null;
    pointers.clear();
    sequencePinched = false;
    selection = null;
    if (preview) {
      cursor = [photo.width / 2, photo.height / 2];
      mode = photo.cornersPx.filter(Boolean).length === 4 ? 'edgePx' : 'cornersPx';
      resize();
      fit();
    } else {
      cursor = null;
      mode = 'cornersPx';
    }
    changed();
  }

  function setMode(nextMode) {
    if (!preview || locked || mode === nextMode) return;
    action = null;
    mode = nextMode;
    selection = null;
    changed();
  }

  function edit(mutate) {
    action = null;
    photo.history.push({
      cornersPx: copyPoints(photo.cornersPx), edgePx: copyPoints(photo.edgePx), mode, selection,
    });
    mutate();
    changed(true);
  }

  function addPoint(point) {
    const list = photo[mode];
    const gap = list.indexOf(null);
    if (mode === 'cornersPx' && list.length === 4 && gap === -1) return;
    edit(() => {
      if (gap === -1) list.push(point);
      else list[gap] = point;
      cursor = point;
    });
  }

  function deselect() {
    if (!preview || locked || selection === null) return;
    action = null;
    cursor = photo[mode][selection];
    selection = null;
    changed();
  }

  function selectStep(direction) {
    if (!preview || locked) return;
    action = null;
    const choices = photo[mode].flatMap((point, index) => point ? [index] : []);
    if (choices.length === 0) return;
    const current = selection === null ? (direction === 1 ? -1 : 0) : choices.indexOf(selection);
    selection = choices[(current + direction + choices.length) % choices.length];
    cursor = photo[mode][selection];
    keepVisible(cursor);
    changed();
  }

  function removePoint() {
    if (!preview || locked || selection === null) return;
    edit(() => {
      const list = photo[mode];
      cursor = list[selection];
      if (mode === 'cornersPx') list[selection] = null;
      else list.splice(selection, 1);
      selection = null;
    });
  }

  function undo() {
    if (!preview || locked || photo.history.length === 0) return;
    action = null;
    const last = photo.history.pop();
    photo.cornersPx = last.cornersPx;
    photo.edgePx = last.edgePx;
    mode = last.mode;
    selection = last.selection;
    if (selection !== null) keepVisible(photo[mode][selection]);
    changed(true);
  }

  function moveBy([dx, dy], step) {
    const old = selection === null ? cursor : photo[mode][selection];
    if (selection === null) {
      const [x, y] = toScreen(old);
      if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) cursor = toImage(center());
    }
    const [x, y] = selection === null ? cursor : old;
    const point = boundPoint([x + dx * step, y + dy * step]);
    keepVisible(point);
    if (selection !== null && !samePoint(point, old)) {
      edit(() => { photo[mode][selection] = point; });
    } else {
      cursor = point;
      changed();
    }
  }

  canvas.addEventListener('keydown', event => {
    if (!preview || locked || pointers.size > 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = KEYS.get(event.key);
    if (direction) moveBy(direction, event.shiftKey ? 10 : 1);
    else if (event.key === 'Enter' && selection === null) addPoint(cursor);
    else if (event.key === 'PageUp') selectStep(-1);
    else if (event.key === 'PageDown') selectStep(1);
    else if (event.key === 'Escape') deselect();
    else if (event.key === 'Delete' || event.key === 'Backspace') removePoint();
    else return;
    event.preventDefault();
  });

  function local(event) {
    const bounds = canvas.getBoundingClientRect();
    return [event.clientX - bounds.left, event.clientY - bounds.top];
  }

  function nearest([x, y], touch) {
    const style = getComputedStyle(canvas);
    let distance = token(style, touch ? '--size-arc-handle-touch' : '--size-arc-handle-visible') / 2;
    let index = null;
    for (const [i, point] of photo[mode].entries()) {
      if (!point) continue;
      const [sx, sy] = toScreen(point);
      const miss = Math.hypot(sx - x, sy - y);
      if (miss < distance) {
        index = i;
        distance = miss;
      }
    }
    return index;
  }

  function pinchPosition() {
    const [[ax, ay], [bx, by]] = [...pointers.values()];
    return { midpoint: [(ax + bx) / 2, (ay + by) / 2], distance: Math.max(1, Math.hypot(bx - ax, by - ay)) };
  }

  function startPinch() {
    const { midpoint, distance } = pinchPosition();
    pinch = { anchor: toImage(midpoint), initialDistance: distance, initialScale: scale };
  }

  canvas.addEventListener('pointerdown', event => {
    if (!preview || locked || event.button !== 0) return;
    const point = local(event);
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point);
    if (pointers.size >= 2) {
      action = null;
      sequencePinched = true;
      startPinch();
      changed();
      return;
    }
    canvas.focus({ preventScroll: true });
    selection = nearest(point, event.pointerType === 'touch');
    const imagePoint = selection === null ? toImage(point) : photo[mode][selection];
    action = { type: 'press', start: point, point: imagePoint, origin: [...offset] };
    changed();
  });

  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const point = local(event);
    pointers.set(event.pointerId, point);
    if (pinch) {
      const { midpoint, distance } = pinchPosition();
      scale = clamp(pinch.initialScale * distance / pinch.initialDistance, fitScale, maxScale());
      place(midpoint, pinch.anchor);
      schedulePaint();
      return;
    }
    if (sequencePinched || !action) return;
    const dx = point[0] - action.start[0];
    const dy = point[1] - action.start[1];
    if (action.type === 'press') {
      const threshold = token(getComputedStyle(canvas), '--size-gesture-slop');
      if (Math.hypot(dx, dy) <= threshold) return;
      action.type = selection === null ? 'pan' : 'drag';
    }
    if (action.type === 'drag') {
      const initial = photo[mode][selection];
      action.point = boundPoint([initial[0] + dx / scale, initial[1] + dy / scale]);
    } else {
      place([action.origin[0] + dx, action.origin[1] + dy], [0, 0]);
    }
    schedulePaint();
  });

  function finishPointer(event, canceled) {
    if (!pointers.delete(event.pointerId)) return;
    if (sequencePinched) {
      if (pointers.size >= 2) startPinch();
      else pinch = null;
      if (pointers.size === 0) sequencePinched = false;
      changed();
      return;
    }
    const last = action;
    action = null;
    if (!canceled && last?.type === 'drag' && !samePoint(last.point, photo[mode][selection])) {
      edit(() => { photo[mode][selection] = last.point; });
    } else if (!canceled && last?.type === 'press' && selection === null && inside(last.point)) {
      addPoint(last.point);
    }
    changed();
  }

  canvas.addEventListener('pointerup', event => finishPointer(event, false));
  canvas.addEventListener('pointercancel', event => finishPointer(event, true));
  canvas.addEventListener('lostpointercapture', event => finishPointer(event, true));
  canvas.addEventListener('focus', schedulePaint);
  canvas.addEventListener('blur', schedulePaint);
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  function setLocked(value) {
    locked = value;
    if (locked) {
      pointers.clear();
      pinch = null;
      action = null;
      sequencePinched = false;
      schedulePaint();
    }
  }

  function state() {
    return {
      mode, selection, point: selection === null ? cursor : photo?.[mode][selection],
      shown: preview !== null, canZoomIn: scale < maxScale(), canZoomOut: scale > fitScale,
      canPanX: !!preview && photo.width * scale > viewport.width,
      canPanY: !!preview && photo.height * scale > viewport.height,
    };
  }

  return { setPhoto, setMode, setLocked, state, fit, zoomBy, panBy, selectStep, deselect, removePoint, undo };
}
