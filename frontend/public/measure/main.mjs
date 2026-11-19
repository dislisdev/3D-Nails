// Πειραματικό · σύνδεση οθόνης και συσκευής · WebApp 0.2.0.
import { createEvaluationPair, createMeasurement, prepareScale } from './core/measurement.mjs';
import { defaultThreshold } from './core/image.mjs';
import { alternativeIndex } from './core/seed-contour.mjs';
import { clamp, fractionAtPoint, pointInOutline } from './core/geometry.mjs';
import { APP_NAME, INPUT_MESSAGES, MeasurementInputError } from './core/catalog.mjs';
import { cameraErrorKey, readFileImage, readFrame, requestCamera, stopMedia } from './ui/acquisition.mjs';
import { checkEvaluationChoices, inputFrom, measurementFields, selectionFrom, sourceFrom } from './ui/fields.mjs';
import { initialState, messages, pickedRegion, targetFor } from './ui/model.mjs';
import { number, overlayContents, pageContent } from './ui/templates.mjs';
import { openContourReader, waitForPaint } from './ui/contour-reader.mjs';
import { bindViewport, canZoomIn, canZoomOut, cursorAt, drawRaster, fitCursor, viewBoxFor, viewportFor, zoomStep, zoomViewport } from './ui/viewport.mjs';

const root = document.getElementById('app');
const live = document.getElementById('live');
let state = initialState();
let raster = null;
let contourReader = null;
let viewerObserver = null;
let downloadUrl = null;
let picker = null;
let cameraStream = null;
let cameraSequence = 0;

function announce(text) {
  live.textContent = text;
}

function render({ focus, open } = {}) {
  const oldCanvas = root.querySelector('#raster');
  const oldVideo = root.querySelector('#camera-preview');
  const panels = new Set(state.openPanels);
  for (const detail of root.querySelectorAll('details[id]')) {
    if (detail.open) panels.add(detail.id);
    else panels.delete(detail.id);
  }
  if (open) panels.add(open);
  state.openPanels = [...panels];
  picker = null;
  state.openPicker = null;
  root.innerHTML = pageContent(state);
  const canvas = root.querySelector('#raster');
  const video = root.querySelector('#camera-preview');
  if (video && oldVideo && cameraStream === oldVideo.srcObject && cameraStream) video.replaceWith(oldVideo);
  if (canvas && raster && oldCanvas?.dataset.identity === raster.info.image_id) canvas.replaceWith(oldCanvas);
  if (canvas && raster) {
    root.querySelector('#raster').dataset.identity = raster.info.image_id;
    repaintViewer({ raster: true });
  }
  viewerObserver?.disconnect();
  const stage = root.querySelector('#image-stage');
  if (viewerObserver && stage) viewerObserver.observe(stage);
  if (focus) {
    const active = document.getElementById(focus) ?? root.querySelector('[name="' + focus + '"]:enabled') ?? root.querySelector('#stage-title');
    active?.focus();
  }
}

function tokenSize(name) {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
}

function repaintViewer({ raster: updateRaster = false } = {}) {
  const stage = root.querySelector('#image-stage');
  if (!stage || !state.image) return;
  const svg = stage.querySelector('#image-overlay');
  const view = viewportFor(state);
  const box = stage.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const units = [view.width / box.width, view.height / box.height];
  svg.setAttribute('viewBox', viewBoxFor(view));
  const focused = document.activeElement?.dataset.handle;
  svg.innerHTML = overlayContents(state, {
    marker: units.map(unit => unit * tokenSize('--size-arc-handle-visible')),
    hit: units.map(unit => unit * tokenSize('--size-arc-handle-touch')),
  });
  if (focused) svg.querySelector('[data-handle="' + focused + '"]')?.focus({ preventScroll: true });
  if (updateRaster && raster) drawRaster(stage.querySelector('#raster'), raster.canvas, state);
  const more = root.querySelector('[data-action="zoom-in"]');
  const less = root.querySelector('[data-action="zoom-out"]');
  const all = root.querySelector('[data-action="zoom-fit"]');
  for (const [button, unavailable] of [[more, !canZoomIn(state)], [less, !canZoomOut(state)], [all, !canZoomOut(state)]]) {
    button?.setAttribute('aria-disabled', String(unavailable));
  }
}

function go(step) {
  state.step = step;
  state.draft = null;
  state.cursor = null;
  state.notice = null;
  state.pick = null;
  render({ focus: 'stage-title' });
}

function setNotice(key, tone = 'error', { text = messages[key], field, open, focus } = {}) {
  state.notice = { key, text, tone, field };
  render({ open, focus: focus ?? field ?? 'stage-title' });
  if (tone !== 'error') announce(text);
}

function showError(error, fallback, focus) {
  if (!(error instanceof MeasurementInputError)) return setNotice(fallback, 'error', { focus });
  let field = error.code === 'coin' ? 'coinId' : measurementFields[error.code];
  if (error.code === 'outline') field = state.step === 'scale' ? 'referenceX' : 'targetX';
  const topFields = ['coinId', 'targetCoinId', 'targetId', 'referenceId'];
  const open = field?.startsWith('control') ? 'evaluation-control'
    : field && !topFields.includes(field) ? state.step + '-settings' : undefined;
  setNotice(error.code, 'error', { text: error.message, field, open, focus: field ?? focus });
}

function releaseDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
}

function reset() {
  stopCamera();
  releaseDownload();
  contourReader?.close();
  contourReader = null;
  raster = null;
  state = initialState();
  root.replaceChildren();
  render({ focus: 'choose-file' });
  announce('Η εικόνα αφαιρέθηκε από τη σελίδα.');
}

function newImage(frame, name, origin) {
  const previous = state.form;
  releaseDownload();
  contourReader?.close();
  raster = frame;
  contourReader = openContourReader(frame);
  state = initialState();
  state.form.purpose = previous.purpose;
  if (origin === 'file') {
    const { provenance, generatorId, generatorVersion } = previous;
    Object.assign(state.form, { provenance, generatorId, generatorVersion });
  }
  state.image = { info: frame.info, name, origin, original: frame.original, ratio: frame.ratio };
  go('scale');
  announce('Η εικόνα άνοιξε. Άγγιξε το κέρμα αναφοράς.');
}

async function loadFile(file, origin) {
  const originButton = origin === 'photo' ? 'take-photo' : 'choose-file';
  if (!file) return setNotice(origin === 'photo' ? 'cameraCancel' : 'fileCancel', 'info', { focus: originButton });
  try {
    if (origin === 'file') sourceFrom(state.form);
  } catch (error) {
    showError(error, 'fileRead', 'choose-file');
    return;
  }
  state.busy = origin === 'photo' ? 'photo' : 'file';
  state.notice = null;
  render({ focus: originButton });
  try {
    const image = await readFileImage(file);
    newImage(image, file.name, origin);
  } catch (error) {
    state.busy = null;
    showError(error, 'fileRead', originButton);
  }
}

function stopCamera() {
  cameraSequence++;
  stopMedia(cameraStream);
  cameraStream = null;
  state.camera = null;
  state.cameraSize = null;
  if (state.busy === 'capture') state.busy = null;
}

function cancelCamera() {
  stopCamera();
  setNotice('cameraCancel', 'info', { focus: 'open-camera' });
}

async function openCamera() {
  const token = ++cameraSequence;
  state.camera = 'requesting';
  state.notice = null;
  render({ focus: 'cancel-camera' });
  const current = () => token === cameraSequence;
  try {
    const stream = await requestCamera(navigator.mediaDevices);
    if (!current()) {
      stopMedia(stream);
      return;
    }
    cameraStream = stream;
    for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => {
      if (current()) {
        stopCamera();
        setNotice('cameraStart', 'error', { focus: 'open-camera' });
      }
    }, { once: true });
    state.camera = 'starting';
    render({ focus: 'cancel-camera' });
    const video = root.querySelector('#camera-preview');
    video.srcObject = stream;
    await video.play();
    if (!current()) return;
    state.cameraSize = [video.videoWidth, video.videoHeight];
    video.addEventListener('resize', () => {
      if (!current()) return;
      state.cameraSize = [video.videoWidth, video.videoHeight];
      const dimensions = root.querySelector('#camera-resolution');
      if (dimensions) dimensions.textContent = state.cameraSize.map(value => number(value, 0)).join(' × ') + ' px';
    });
    state.camera = 'ready';
    render({ focus: 'capture-camera' });
    announce('Η προεπισκόπηση της κάμερας είναι έτοιμη.');
  } catch (error) {
    if (!current()) return;
    stopCamera();
    setNotice(cameraErrorKey(error), 'error', { focus: 'open-camera' });
  }
}

async function captureCamera() {
  if (state.camera !== 'ready') return;
  const video = root.querySelector('#camera-preview');
  const token = cameraSequence;
  state.busy = 'capture';
  state.camera = 'capturing';
  try {
    const frame = readFrame(video, video.videoWidth, video.videoHeight);
    stopMedia(cameraStream);
    cameraStream = null;
    render({ focus: 'capture-camera' });
    const raster = await frame;
    if (token !== cameraSequence) return;
    stopCamera();
    newImage(raster, 'Λήψη καρέ από κάμερα', 'camera');
  } catch (error) {
    if (token !== cameraSequence) return;
    stopCamera();
    setNotice(error.code === 'fileSize' ? 'fileSize' : 'cameraCapture', 'error', { focus: 'open-camera' });
  }
}

function startSeedAgain() {
  const prefix = state.step === 'scale' ? 'reference' : 'target';
  const key = prefix + 'Id';
  state.draft = null;
  state.form[key] = '';
  state.form[prefix + 'X'] = state.form[prefix + 'Y'] = '';
  state.regions = state.regions.filter(region => region.id !== key);
  state.notice = null;
  render({ focus: 'image-stage' });
}

async function findEdge(seed, candidate) {
  const reference = pickedRegion(state, 'referenceId');
  const selectingTarget = state.step === 'contour';
  if (selectingTarget && reference && pointInOutline(reference.points, seed)) {
    state.draft = null;
    setNotice('sameObject');
    return;
  }
  state.cursor = seed;
  const previous = candidate === undefined ? null : state.draft;
  state.draft = previous;
  state.busy = 'edge';
  state.notice = null;
  render();
  announce('Ψάχνω την ακμή.');
  try {
    const threshold = state.form.manualThreshold ? Number(state.form.threshold) : undefined;
    const result = await contourReader.at(seed, { index: candidate, threshold });
    state.busy = null;
    state.draft = { ...result, seed };
    if (result.ok && selectingTarget && reference && pointInOutline(result.region.points, reference.seed ?? reference.center)) {
      state.draft = null;
      setNotice('sameObject');
    } else if (result.ok) {
      render({ focus: 'confirm-seed' });
      announce('Βρέθηκε περίγραμμα. Έλεγξέ το στην εικόνα.');
    } else {
      const reason = result.reason.trim().replace(/^[\p{Ll}]/u, char => char.toLocaleUpperCase('el')).replace(/\.$/, '');
      setNotice('edge', 'error', { text: reason + '. ' + messages.edge });
    }
  } catch {
    state.busy = null;
    setNotice('edge');
  }
}

function setScale() {
  try {
    const input = inputFrom(state);
    if (!input.referenceRegion) throw new MeasurementInputError('reference', 'Άγγιξε το κέρμα και επιβεβαίωσε το περίγραμμά του.');
    state.scale = prepareScale(input).calibration;
    state.results = [];
    go('contour');
    announce(state.scale.reference_length_px < 300 ? messages.referenceResolution : 'Η κλίμακα ορίστηκε. Άγγιξε το αντικείμενο που μετράς.');
  } catch (error) {
    showError(error, 'process', 'set-scale');
  }
}

function confirmSeed() {
  if (!state.draft?.region) return;
  const isReference = state.step === 'scale';
  const key = isReference ? 'referenceId' : 'targetId';
  state.regions = [...state.regions.filter(region => region.id !== key), { ...state.draft.region, id: key }];
  state.form[key] = key;
  state.draft = null;
  state.notice = null;
  if (state.form.purpose === 'evaluation') {
    render({ focus: isReference ? 'set-scale' : 'measure' });
    announce('Το περίγραμμα κρατήθηκε.');
  } else if (isReference && state.form.dimensionKind === 'coin' && !state.form.coinId) {
    render({ focus: 'coinId' });
    announce('Διάλεξε ποιο κέρμα άγγιξες.');
  } else if (isReference) setScale();
  else void measure();
}

function switchCandidate(direction) {
  const index = alternativeIndex(state.draft, direction);
  if (index >= 0) void findEdge(state.draft.seed, index);
}

async function measure() {
  if (!pickedRegion(state, 'targetId')) {
    return setNotice('target', 'error', { text: INPUT_MESSAGES.target, field: 'targetId' });
  }
  state.busy = 'measure';
  state.notice = null;
  state.pick = null;
  render({ focus: 'measure' });
  await waitForPaint();
  try {
    const input = inputFrom(state);
    const options = selectionFrom(state.form);
    if (input.purpose === 'evaluation') {
      checkEvaluationChoices(state, input);
      state.results = await createEvaluationPair(input, options);
    } else state.results = [await createMeasurement(input, options)];
    state.resultIndex = 0;
    state.form.resultChoice = '0';
    state.busy = null;
    go('results');
    if (state.results.length > 1) {
      announce('Μετρήθηκαν το ολόκληρο περίγραμμα και το ένα τρίτο του.');
      return;
    }
    const count = state.results[0].measurement.methods.filter(method => method.raw.status === 'ok').length;
    announce(count === 2 ? 'Και οι δύο μέθοδοι έδωσαν ακτίνα.'
      : count === 1 ? 'Η μία μέθοδος έδωσε ακτίνα και η άλλη αρνήθηκε.' : 'Οι δύο μέθοδοι αρνήθηκαν να δώσουν ακτίνα.');
  } catch (error) {
    state.busy = null;
    showError(error, 'process', 'measure');
  }
}

function download() {
  const artifact = state.results[state.resultIndex];
  if (!artifact?.verdict.passed) return;
  try {
    releaseDownload();
    downloadUrl = URL.createObjectURL(new Blob([artifact.json], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = downloadUrl;
    const mode = artifact.measurement.selection.target_kind;
    const label = mode === 'whole' ? 'πλήρες' : mode === 'third_perimeter' ? 'τρίτο' : 'τόξο';
    link.download = 'πειραματικό-' + label + '-' + artifact.measurement.measurement_id + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    announce('Ο browser έλαβε το αίτημα λήψης αρχείου.');
  } catch {
    setNotice('export');
  }
}

function closePicker(returnFocus = false) {
  if (!picker) return;
  const { trigger, list } = picker;
  picker = null;
  trigger.setAttribute('aria-expanded', 'false');
  list.hidden = true;
  if (returnFocus) trigger.focus();
}

function focusOption(index) {
  const { list, options } = picker;
  picker.index = (index + options.length) % options.length;
  options.forEach((option, i) => option.toggleAttribute('data-active', i === picker.index));
  const active = options[picker.index];
  active.dataset.active = 'true';
  list.setAttribute('aria-activedescendant', active.id);
  active.scrollIntoView({ block: 'nearest' });
}

function openPicker(trigger, fallbackIndex = 0) {
  if (picker?.trigger === trigger) return closePicker(true);
  closePicker();
  const list = document.getElementById(trigger.getAttribute('aria-controls'));
  const options = [...list.querySelectorAll('[role=option]')];
  picker = { trigger, list, options, buffer: '', last: 0 };
  const selected = options.findIndex(option => option.getAttribute('aria-selected') === 'true');
  trigger.setAttribute('aria-expanded', 'true');
  list.hidden = false;
  list.focus({ preventScroll: true });
  focusOption(selected >= 0 ? selected : fallbackIndex);
}

function chooseCoin(option) {
  const name = picker.trigger.dataset.coinTrigger;
  state.form[name] = option.dataset.coin;
  state.notice = null;
  if (name === 'coinId' && state.step === 'scale' && !state.draft && state.form.purpose === 'measurement'
    && pickedRegion(state, 'referenceId')) setScale();
  else render({ focus: name });
}

const normalize = value => value.toLocaleLowerCase('el').normalize('NFD').replace(/\p{M}/gu, '');

function pickerKey(event) {
  const { key } = event;
  const opener = event.target.closest('[data-coin-trigger]');
  if (opener && (key === 'ArrowDown' || key === 'ArrowUp')) {
    event.preventDefault();
    openPicker(opener, key === 'ArrowUp' ? -1 : 0);
    return;
  }
  if (!picker || event.target !== picker.list) return;
  if (key === 'Tab') return;
  const { options, index } = picker;
  if (key === 'Escape') closePicker(true);
  else if (key === 'Enter' || key === ' ') chooseCoin(options[index]);
  else if (key === 'ArrowDown') focusOption(index + 1);
  else if (key === 'ArrowUp') focusOption(index - 1);
  else if (key === 'Home') focusOption(0);
  else if (key === 'End') focusOption(options.length - 1);
  else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const interval = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--duration-typeahead'));
    const char = normalize(key);
    const append = event.timeStamp - picker.last <= interval && picker.buffer !== char;
    picker.buffer = append ? picker.buffer + char : char;
    picker.last = event.timeStamp;
    for (let offset = 1; offset <= options.length; offset++) {
      const candidate = (index + offset) % options.length;
      const label = normalize(options[candidate].firstElementChild.textContent);
      if (label.startsWith(picker.buffer) || label.split(' ').some(word => word.startsWith(picker.buffer))) {
        focusOption(candidate);
        break;
      }
    }
  } else return;
  event.preventDefault();
}

function adjustArc(name, point) {
  const target = targetFor(state);
  if (!target) return;
  state.form[name] = Math.round(10000 * fractionAtPoint(target.points, point)) / 100;
  const field = root.querySelector('#' + name);
  if (field) {
    field.value = state.form[name];
    const readout = root.querySelector('[data-reading="' + name + '"]');
    readout.textContent = number(state.form[name], 2) + readout.dataset.suffix;
  }
  repaintViewer();
}

function pickPoint(point) {
  if (!state.image || state.busy) return;
  const pick = state.pick;
  if (!pick) {
    if (['scale', 'contour'].includes(state.step)) void findEdge(point);
    return;
  }
  if (['arcStart', 'arcEnd', 'anchorPercent'].includes(pick)) adjustArc(pick, point);
  else {
    const prefix = pick.endsWith('Center') ? pick.slice(0, -'Center'.length) : pick;
    state.form[prefix + 'X'] = String(Math.round(point[0] * 100) / 100);
    state.form[prefix + 'Y'] = String(Math.round(point[1] * 100) / 100);
  }
  state.pick = null;
  state.notice = null;
  render({ focus: 'pick-' + pick });
  announce('Το σημείο σημειώθηκε στην εικόνα.');
}

function updateZoom(direction, focus) {
  if (direction === 0) state.viewport = null;
  else zoomStep(state, direction);
  fitCursor(state);
  repaintViewer({ raster: true });
  if (focus) root.querySelector('#image-stage')?.focus({ preventScroll: true });
}

const actions = {
  file: () => root.querySelector('#image-file').click(),
  photo: () => root.querySelector('#photo-file').click(),
  'confirm-seed': confirmSeed,
  'retry-seed': startSeedAgain,
  'seed-larger': () => switchCandidate(1),
  'seed-smaller': () => switchCandidate(-1),
  'zoom-in': () => updateZoom(1),
  'zoom-out': () => updateZoom(-1),
  'zoom-fit': () => updateZoom(0),
  'suggest-threshold': () => {
    state.form.threshold = defaultThreshold(raster.gray);
    state.draft = null;
    render({ focus: 'threshold' });
  },
  reset,
  'open-camera': openCamera,
  'cancel-camera': cancelCamera,
  'capture-camera': captureCamera,
  'to-scale': () => go('scale'),
  'back-image': () => go('image'),
  'back-scale': () => go('scale'),
  'back-contour': () => { state.results = []; go('contour'); },
  'back-results': () => go('results'),
  'to-export': () => {
    go('export');
    announce(state.results[state.resultIndex].verdict.passed ? 'Το αρχείο πέρασε τον έλεγχο του συμβολαίου.'
      : 'Το αρχείο δεν πέρασε τον έλεγχο του συμβολαίου.');
  },
  download,
};

root.addEventListener('click', event => {
  if (state.busy) {
    if (state.camera && event.target.closest('[data-action="cancel-camera"]')) cancelCamera();
    return;
  }
  const option = event.target.closest('[data-coin]');
  if (option && picker) {
    chooseCoin(option);
    return;
  }
  const opener = event.target.closest('[data-coin-trigger]');
  if (opener) {
    openPicker(opener);
    return;
  }
  if (picker && !picker.list.contains(event.target)) closePicker();
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action?.startsWith('pick-')) {
    const pick = action.slice(5);
    if ((pick.startsWith('arc') || pick === 'anchorPercent') && !targetFor(state)) {
      setNotice('target', 'error', { text: INPUT_MESSAGES.target, field: 'targetId' });
      return;
    }
    state.pick = state.pick === pick ? null : pick;
    render({ focus: action });
    announce(state.pick ? 'Δείξε το σημείο πάνω στην εικόνα ή χρησιμοποίησε τη φόρμα.' : 'Η σήμανση ακυρώθηκε.');
  } else if (action && event.target.closest('[data-action]').getAttribute('aria-disabled') !== 'true') void actions[action]?.();
});

root.addEventListener('input', event => {
  const field = event.target;
  if (state.busy || !Object.hasOwn(state.form, field.name)) return;
  if (field.type === 'radio' && !field.checked) return;
  state.form[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  if (field.type !== 'range') {
    if (/^(reference|target|controlStart|controlEnd)[XY]$/.test(field.name)) {
      repaintViewer();
    }
    return;
  }
  const readout = root.querySelector('[data-reading="' + field.name + '"]');
  readout.textContent = number(Number(field.value), field.name === 'threshold' ? 0 : 2) + readout.dataset.suffix;
  if (field.name !== 'threshold') repaintViewer();
});

const renderOnChange = new Set(['provenance', 'dimensionKind', 'manualThreshold', 'threshold', 'referenceEdge', 'targetEdge',
  'selectionMode', 'materialInside', 'purpose', 'evaluationScope', 'resultChoice', 'controlKind']);
root.addEventListener('change', event => {
  const field = event.target;
  if (['image-file', 'photo-file'].includes(field.id)) {
    void loadFile(field.files[0], field.id === 'photo-file' ? 'photo' : 'file');
    return;
  }
  if (state.busy || !renderOnChange.has(field.name)) return;
  state.pick = null;
  state.notice = null;
  if (['manualThreshold', 'threshold'].includes(field.name)) state.draft = null;
  if (field.name === 'purpose' && field.value === 'evaluation') {
    state.form.dimensionKind = 'coin';
  }
  if (['purpose', 'provenance'].includes(field.name) && state.form.purpose === 'evaluation' && state.form.provenance === 'object') {
    for (const edge of ['referenceEdge', 'targetEdge']) if (state.form[edge] === 'planar_trace') state.form[edge] = '';
  }
  if (field.name === 'resultChoice') state.resultIndex = Number(field.value);
  render({ focus: field.id });
  if (field.name === 'resultChoice' && state.step === 'export') {
    announce(state.results[state.resultIndex].verdict.passed ? 'Το αρχείο πέρασε τον έλεγχο του συμβολαίου.'
      : 'Το αρχείο δεν πέρασε τον έλεγχο του συμβολαίου.');
  }
});

root.addEventListener('mousedown', event => {
  if (picker?.list.contains(event.target)) event.preventDefault();
});
root.addEventListener('focusout', event => {
  if (picker && event.target === picker.list && !picker.list.contains(event.relatedTarget)) closePicker();
});
root.addEventListener('cancel', event => {
  if (event.target.id === 'image-file') setNotice('fileCancel', 'info', { focus: 'choose-file' });
  if (event.target.id === 'photo-file') setNotice('cameraCancel', 'info', { focus: 'take-photo' });
}, true);
function viewerKey(event) {
  const stage = event.target.closest('#image-stage');
  if (!stage || state.busy) return;
  const { key } = event;
  const handle = event.target.dataset.handle;
  const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const move = offsets[key];
  if (handle && (move || key === 'Home' || key === 'End')) {
    const field = root.querySelector('#' + handle);
    if (field) {
      const value = key === 'Home' ? 0 : key === 'End' ? 100
        : clamp(Number(state.form[handle]) + (move[0] || -move[1]) * (event.shiftKey ? 5 : 1), 0, 100);
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else if (move) {
    const view = viewportFor(state);
    const step = (event.shiftKey ? 1 : 0.15) * view.width / Math.max(1, stage.clientWidth) * tokenSize('--size-arc-handle-touch');
    if (event.altKey) {
      zoomViewport(state, view.zoom, [0.5, 0.5], [0.5 - move[0] * 0.15, 0.5 - move[1] * 0.15]);
      fitCursor(state);
      repaintViewer({ raster: true });
    } else {
      state.cursor = cursorAt(state).map((coordinate, i) => coordinate + step * move[i]);
      fitCursor(state);
      repaintViewer();
    }
  } else if (key === 'Enter' || key === ' ') {
    if (handle) {
      state.pick = handle;
      render({ focus: 'image-stage' });
    } else pickPoint(cursorAt(state));
  } else if (key === '+' || key === '=') updateZoom(1, true);
  else if (key === '-') updateZoom(-1, true);
  else if (key === '0') updateZoom(0, true);
  else return;
  event.preventDefault();
}

root.addEventListener('keydown', event => {
  pickerKey(event);
  if (!event.defaultPrevented) viewerKey(event);
  if (!event.defaultPrevented && event.key === 'Escape' && state.camera) {
    event.preventDefault();
    cancelCamera();
  }
  if (!event.defaultPrevented && event.key === 'Escape' && state.pick) {
    const action = 'pick-' + state.pick;
    state.pick = null;
    render({ focus: action });
    announce('Η σήμανση ακυρώθηκε.');
  }
});
root.addEventListener('submit', event => {
  event.preventDefault();
  if (state.busy) return;
  if (event.target.dataset.submit === 'scale') setScale();
  if (event.target.dataset.submit === 'measure') void measure();
});
window.addEventListener('pagehide', () => {
  releaseDownload();
  stopCamera();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) render();
});
if (typeof ResizeObserver === 'function') viewerObserver = new ResizeObserver(() => repaintViewer());
bindViewport(root, {
  getState: () => state, select: pickPoint, updateHandle: adjustArc,
  repaint: repaintViewer, tapTolerance: () => tokenSize('--size-gesture-slop'),
});
document.title = APP_NAME;
render();
if (window.isSecureContext && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('./sw.mjs', import.meta.url), { type: 'module', updateViaCache: 'none' }).catch(() => {});
}
