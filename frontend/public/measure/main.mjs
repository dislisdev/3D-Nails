// Πειραματικό · σύνδεση οθόνης και συσκευής · WebApp 0.1.0.
import { createEvaluationPair, createMeasurement, prepareScale } from './core/measurement.mjs';
import { defaultThreshold, findObjects, matchingRegion } from './core/image.mjs';
import { clamp, fractionAtPoint } from './core/geometry.mjs';
import { INPUT_MESSAGES, MeasurementInputError } from './core/catalog.mjs';
import { cameraErrorKey, readFileImage, readFrame, requestCamera, stopMedia } from './ui/acquisition.mjs';
import { checkEvaluationChoices, inputFrom, measurementFields, selectionFrom, sourceFrom } from './ui/fields.mjs';
import { initialState, messages, pickedRegion } from './ui/model.mjs';
import { number, overlayContents, pageContent } from './ui/templates.mjs';

const root = document.getElementById('app');
const live = document.getElementById('live');
let state = initialState();
let raster = null;
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
  if (canvas && raster) {
    if (oldCanvas?.dataset.identity === raster.info.image_id) canvas.replaceWith(oldCanvas);
    else {
      canvas.dataset.identity = raster.info.image_id;
      canvas.getContext('2d').drawImage(raster.canvas, 0, 0);
    }
  }
  if (focus) {
    const active = document.getElementById(focus) ?? root.querySelector('[name="' + focus + '"]:enabled') ?? root.querySelector('#stage-title');
    active?.focus();
  }
}

function go(step) {
  state.step = step;
  state.notice = null;
  state.pick = null;
  render({ focus: 'stage-title' });
}

function setNotice(key, tone = 'error', { text = messages[key], field, open, focus, renderNow = true } = {}) {
  state.notice = { key, text, tone, field };
  if (renderNow) render({ open, focus: focus ?? field ?? 'stage-title' });
  if (tone !== 'error') announce(text);
}

function showError(error, fallback, focus) {
  if (!(error instanceof MeasurementInputError)) return setNotice(fallback, 'error', { focus });
  let field = error.code === 'coin' ? 'coinId' : measurementFields[error.code];
  if (error.code === 'outline') field = state.step === 'scale' ? 'referenceX' : 'targetX';
  const open = field === 'referenceX' ? 'reference-geometry'
    : field === 'targetX' ? 'target-geometry'
      : field === 'cameraDistance' ? 'view-geometry'
      : field?.startsWith('control') ? 'evaluation-control' : undefined;
  setNotice(error.code, 'error', { text: error.message, field, open, focus: field ?? focus });
}

function releaseDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
}

function reset() {
  stopCamera();
  releaseDownload();
  raster = null;
  state = initialState();
  root.replaceChildren();
  render({ focus: 'choose-file' });
  announce('Η εικόνα αφαιρέθηκε από τη σελίδα.');
}

function candidateNotice() {
  const key = state.regions.length === 0 ? 'noObjects' : state.regions.length === 1 ? 'oneObject' : null;
  state.notice = key ? { key, text: messages[key], tone: 'error' } : null;
}

function newImage(frame, name, origin) {
  const { provenance, generatorId, generatorVersion, purpose } = state.form;
  releaseDownload();
  raster = frame;
  state = initialState();
  state.form.purpose = purpose;
  if (origin !== 'camera') Object.assign(state.form, { provenance, generatorId, generatorVersion });
  state.image = { info: frame.info, name, origin };
  state.threshold = defaultThreshold(frame.gray);
  state.form.threshold = state.threshold;
  state.regions = findObjects(frame.gray, frame.info.width_px, frame.info.height_px, state.threshold);
  candidateNotice();
  render({ focus: 'stage-title' });
  if (!state.notice) announce('Η εικόνα άνοιξε. Μπορείς να ορίσεις κλίμακα.');
}

async function loadFile(file) {
  if (!file) return setNotice('fileCancel', 'info', { focus: 'choose-file' });
  state.busy = 'file';
  state.notice = null;
  render({ focus: 'choose-file' });
  try {
    const image = await readFileImage(file);
    newImage(image, file.name, 'file');
  } catch (error) {
    state.busy = null;
    showError(error, 'fileRead', 'choose-file');
  }
}

function stopCamera() {
  cameraSequence++;
  stopMedia(cameraStream);
  cameraStream = null;
  state.camera = null;
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

const waitForPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function applyThreshold() {
  if (!raster) return;
  const previousReference = pickedRegion(state, 'referenceId'), previousTarget = pickedRegion(state, 'targetId');
  state.busy = 'threshold';
  state.notice = null;
  render({ focus: 'apply-threshold' });
  await waitForPaint();
  try {
    const { gray, info } = raster;
    const threshold = Number(state.form.threshold);
    const regions = findObjects(gray, info.width_px, info.height_px, threshold);
    const reference = matchingRegion(previousReference, regions);
    const target = matchingRegion(previousTarget, regions);
    state.regions = regions;
    state.threshold = threshold;
    state.form.referenceId = reference ? String(reference.id) : '';
    state.form.targetId = target && target !== reference ? String(target.id) : '';
    if (!state.form.referenceId) state.form.referenceX = state.form.referenceY = '';
    if (!state.form.targetId) state.form.targetX = state.form.targetY = '';
    state.results = [];
    state.scale = null;
    state.busy = null;
    if (regions.length < 2) state.step = 'image';
    else if (state.step === 'contour') {
      try {
        state.scale = prepareScale(inputFrom(state)).calibration;
      } catch (error) {
        state.step = 'scale';
        showError(error, 'process', 'set-scale');
        return;
      }
    }
    candidateNotice();
    render({ focus: state.step === 'contour' ? 'apply-threshold' : 'stage-title' });
    if (!state.notice) announce('Τα περιγράμματα ενημερώθηκαν με το νέο κατώφλι.');
  } catch {
    state.busy = null;
    setNotice('process');
  }
}

function setScale() {
  try {
    const input = inputFrom(state);
    state.scale = prepareScale(input).calibration;
    if (!pickedRegion(state, 'targetId') || state.form.targetId === state.form.referenceId) {
      const other = state.regions.filter(region => region !== input.referenceRegion);
      state.form.targetId = other.length === 1 ? String(other[0].id) : '';
    }
    state.results = [];
    go('contour');
    announce('Η κλίμακα ορίστηκε. Διάλεξε το περίγραμμα.');
  } catch (error) {
    showError(error, 'process', 'set-scale');
  }
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
  render({ focus: name });
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

function pickPoint(event, stage) {
  if (!state.pick || !state.image) return;
  const { width_px: width, height_px: height } = state.image.info;
  const box = stage.getBoundingClientRect();
  const x = clamp((event.clientX - box.left) * width / box.width - 0.5, 0, width - 1);
  const y = clamp((event.clientY - box.top) * height / box.height - 0.5, 0, height - 1);
  const pick = state.pick;
  if (['arcStart', 'arcEnd', 'anchorPercent'].includes(pick)) {
    const target = pickedRegion(state, 'targetId');
    if (!target) return;
    state.form[pick] = Math.round(10000 * fractionAtPoint(target.points, [x, y])) / 100;
  } else {
    const prefix = pick.endsWith('Center') ? pick.slice(0, -'Center'.length) : pick;
    state.form[prefix + 'X'] = String(Math.round(x * 100) / 100);
    state.form[prefix + 'Y'] = String(Math.round(y * 100) / 100);
  }
  state.pick = null;
  state.notice = null;
  render({ focus: 'pick-' + pick });
  announce('Το σημείο σημειώθηκε στην εικόνα.');
}

const actions = {
  file: () => root.querySelector('#image-file').click(),
  reset,
  'open-camera': openCamera,
  'cancel-camera': cancelCamera,
  'capture-camera': captureCamera,
  'to-scale': () => {
    try {
      sourceFrom(state.form);
      if (state.regions.length >= 2) go('scale');
    } catch (error) {
      showError(error, 'fileRead');
    }
  },
  threshold: applyThreshold,
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
  const stage = event.target.closest('#image-stage');
  if (stage) pickPoint(event, stage);
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action?.startsWith('pick-')) {
    const pick = action.slice(5);
    if ((pick.startsWith('arc') || pick === 'anchorPercent') && !pickedRegion(state, 'targetId')) {
      setNotice('target', 'error', { text: INPUT_MESSAGES.target, field: 'targetId' });
      return;
    }
    state.pick = state.pick === pick ? null : pick;
    render({ focus: action });
    announce(state.pick ? 'Δείξε το σημείο πάνω στην εικόνα ή χρησιμοποίησε τη φόρμα.' : 'Η σήμανση ακυρώθηκε.');
  } else if (action) void actions[action]?.();
});

root.addEventListener('input', event => {
  const field = event.target;
  if (state.busy || !Object.hasOwn(state.form, field.name)) return;
  if (field.type === 'radio' && !field.checked) return;
  state.form[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  if (field.type !== 'range') {
    if (/^(reference|target|controlStart|controlEnd)[XY]$/.test(field.name)) {
      const overlay = root.querySelector('#image-overlay');
      if (overlay) overlay.innerHTML = overlayContents(state);
    }
    return;
  }
  const readout = root.querySelector('[data-reading="' + field.name + '"]');
  readout.textContent = number(Number(field.value), 2) + readout.dataset.suffix;
  if (field.name !== 'threshold') root.querySelector('#image-overlay').innerHTML = overlayContents(state);
});

const renderOnChange = new Set(['provenance', 'dimensionKind', 'referenceId', 'targetId', 'referenceEdge', 'targetEdge',
  'selectionMode', 'materialInside', 'purpose', 'evaluationScope', 'resultChoice', 'controlKind']);
root.addEventListener('change', event => {
  const field = event.target;
  if (field.id === 'image-file') {
    void loadFile(field.files[0]);
    return;
  }
  if (state.busy || !renderOnChange.has(field.name)) return;
  state.pick = null;
  state.notice = null;
  if (field.name === 'referenceId' && state.form.targetId === field.value) state.form.targetId = '';
  if (field.name === 'referenceId') state.form.referenceX = state.form.referenceY = '';
  if (field.name === 'targetId') state.form.targetX = state.form.targetY = '';
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
}, true);
root.addEventListener('keydown', event => {
  pickerKey(event);
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
render();
