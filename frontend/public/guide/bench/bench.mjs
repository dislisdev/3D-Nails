import { createEditor } from './editor.mjs';
import { decodePreview, preparePhoto } from './images.mjs';
import { calculateMeasurement, prepareMeasurement } from './measurement.mjs';
import { createSummary, photoIssue, photoStatusLabel, refusalMessage } from './readout.mjs';
import { renderResult } from './result-view.mjs';
import { focal35ToPixels, MAX_PHOTOS, MIN_EDGE_POINTS, MIN_PHOTOS, parseDiameter, photoStatus, sameFrameSize } from './views.mjs';

const byId = id => document.getElementById(id);
const confirmCard = byId('confirm-card');
const confirmLens = byId('confirm-lens');
const diameter = byId('diameter');
const addPhotos = byId('add-photos');
const picker = byId('file-picker');
const photoList = byId('photo-list');
const activeSection = byId('active-photo');
const editorTools = byId('editor-tools');
const canvas = byId('photo-canvas');
const markCard = byId('mark-card');
const markEdge = byId('mark-edge');
const removePhoto = byId('remove-photo');
const zoomIn = byId('zoom-in');
const zoomOut = byId('zoom-out');
const fitPhoto = byId('fit-photo');
const panButtons = [...document.querySelectorAll('[data-pan]')];
const previousPoint = byId('previous-point');
const nextPoint = byId('next-point');
const clearSelection = byId('clear-selection');
const deletePoint = byId('delete-point');
const undoPoint = byId('undo-point');
const measure = byId('measure');
const measureStatus = byId('measure-status');
const resultDetails = byId('result-details');
const summaryArea = byId('summary-area');
const summaryText = byId('summary-text');
const copySummary = byId('copy-summary');
const copyStatus = byId('copy-status');
const summaryDisclosure = byId('summary-disclosure');

const display = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2, useGrouping: false });

const records = [];
let nextId = 1;
let active = null;
let previewRequest = 0;
let loadingPreview = false;
let importing = false;
let calculating = false;
let copying = false;
let outcome = null;
let originalSummary = '';
let wrapGuideSummary = text => text;
let guideShots = [];
let guideShown = false;
let guideSelectedId;
let guideInputEpoch = 0;

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function photoName(id) {
  return `Φωτογραφία ${id}`;
}

function coords([x, y]) {
  return `x ${display.format(x)} · y ${display.format(y)}`;
}

function pointName(mode, index, list) {
  if (mode === 'cornersPx') return `Γωνία ${index + 1}`;
  if (index === 0) return 'Άκρο Α';
  if (index === list.length - 1) return 'Άκρο Β';
  return `Σημείο ${index + 1}`;
}

function updatePointList(id, mode, list) {
  const rows = list.map((point, index) => {
    const row = document.createElement('li');
    row.textContent = `${pointName(mode, index, list)} · ${point ? coords(point) : 'εκκρεμεί'}`;
    return row;
  });
  if (rows.length === 0) {
    const row = document.createElement('li');
    row.textContent = 'Κανένα σημείο ακόμη.';
    rows.push(row);
  }
  byId(id).replaceChildren(...rows);
}

function updateEditor(pointsChanged) {
  const state = editor.state();
  editorTools.hidden = !state.shown;
  if (!active || !state.shown) return;
  const { photo } = active;
  const corners = photo.cornersPx.filter(Boolean).length;
  const edge = photo.edgePx.length;
  const cardMode = state.mode === 'cornersPx';
  const list = photo[state.mode];
  markCard.setAttribute('aria-pressed', String(cardMode));
  markEdge.setAttribute('aria-pressed', String(!cardMode));
  markCard.disabled = calculating;
  markEdge.disabled = calculating || corners !== 4;
  byId('card-guide').hidden = !cardMode;
  byId('edge-guide').hidden = cardMode;
  const cornerProgress = corners === 4
    ? '4 από 4 γωνίες. Προχώρησε στην άκρη.'
    : `${corners} από 4 γωνίες.`;
  const edgeProgress = edge >= MIN_EDGE_POINTS
    ? `${edge} σημεία άκρης. Έτοιμη για υπολογισμό. Βεβαιώσου ότι ξεκίνησες από το Α και σταμάτησες στο Β.`
    : `${edge} σημεία άκρης. Χρειάζονται τουλάχιστον ${MIN_EDGE_POINTS}.`;
  setText(byId('mark-status'), cardMode ? cornerProgress : edgeProgress);

  const pointLabel = state.selection === null ? 'Σταυρόνημα' : pointName(state.mode, state.selection, list);
  if (state.point) setText(byId('cursor-readout'), `${pointLabel} · ${coords(state.point)} px`);
  zoomIn.disabled = calculating || !state.canZoomIn;
  zoomOut.disabled = calculating || !state.canZoomOut;
  fitPhoto.disabled = calculating || !state.canZoomOut;
  for (const button of panButtons) {
    const canPan = button.dataset.pan.startsWith('0,') ? state.canPanY : state.canPanX;
    button.disabled = calculating || !canPan;
  }
  const hasPoints = list.some(Boolean);
  previousPoint.disabled = calculating || !hasPoints;
  nextPoint.disabled = calculating || !hasPoints;
  clearSelection.disabled = calculating || state.selection === null;
  deletePoint.disabled = calculating || state.selection === null;
  undoPoint.disabled = calculating || photo.history.length === 0;

  const listsBelongToPhoto = byId('corner-list').dataset.photo === String(photo.id);
  if (pointsChanged || !listsBelongToPhoto) {
    byId('corner-list').dataset.photo = String(photo.id);
    updatePointList('corner-list', 'cornersPx', photo.cornersPx);
    updatePointList('edge-list', 'edgePx', photo.edgePx);
  }
}

function updateControls() {
  const photos = records.map(record => record.photo);
  const readyPhotos = photos.filter(photo => photoStatus(photo) === 'ready');
  const ready = readyPhotos.length;
  const isMissingFocal = photo => focal35ToPixels(photo.focal35Mm, photo.width, photo.height) === null;
  const usesCard = readyPhotos.some(isMissingFocal);
  const fitsFrame = !usesCard || sameFrameSize(readyPhotos);
  const lensConfirmed = !usesCard || confirmLens.checked;
  const hasInvalidDiameter = Number.isNaN(parseDiameter(diameter.value));
  const canMeasure = confirmCard.checked && lensConfirmed && fitsFrame && !hasInvalidDiameter
    && ready >= MIN_PHOTOS && !importing && !loadingPreview;
  diameter.setAttribute('aria-invalid', String(hasInvalidDiameter));
  setText(byId('diameter-error'), hasInvalidDiameter ? 'Γράψε θετική διάμετρο σε mm ή άφησε το πεδίο κενό.' : '');
  confirmCard.disabled = calculating;
  confirmLens.disabled = calculating || importing;
  byId('lens-confirmation').hidden = !photos.some(photo => photoStatus(photo) !== 'unreadable' && isMissingFocal(photo));
  diameter.disabled = calculating;

  addPhotos.disabled = calculating || (!importing && records.length >= MAX_PHOTOS);
  addPhotos.setAttribute('aria-busy', String(importing));
  addPhotos.setAttribute('aria-disabled', String(importing || addPhotos.disabled));
  setText(addPhotos, importing ? 'Διαβάζω τις φωτογραφίες…' : 'Πρόσθεσε φωτογραφίες');
  measure.disabled = !calculating && !canMeasure;
  measure.setAttribute('aria-busy', String(calculating));
  measure.setAttribute('aria-disabled', String(calculating || measure.disabled));
  setText(measure, calculating ? 'Υπολογίζω την ακτίνα…' : 'Υπολόγισε την ακτίνα');
  addPhotos.toggleAttribute('data-primary', !canMeasure && !outcome && !addPhotos.disabled);
  measure.toggleAttribute('data-primary', calculating || (canMeasure && !outcome));
  copySummary.toggleAttribute('data-primary', outcome !== null);
  removePhoto.disabled = importing || calculating;
  for (const record of records) {
    record.button.setAttribute('aria-pressed', String(record === active));
    record.button.disabled = importing || calculating;
    setText(record.status, photoStatusLabel(record.photo));
  }

  const parts = [];
  if (calculating) {
    parts.push('Υπολογισμός σε εξέλιξη.');
  } else if (outcome) {
    parts.push(outcome.ok ? 'Η μέτρηση ολοκληρώθηκε.' : 'Η μέτρηση απορρίφθηκε.');
  } else {
    if (!confirmCard.checked) parts.push('Επιβεβαίωσε το μέγεθος της κάρτας.');
    if (!lensConfirmed) parts.push(refusalMessage('SAME_LENS_REQUIRED'));
    if (!fitsFrame) parts.push(refusalMessage('FRAME_SIZE_MISMATCH'));
    if (hasInvalidDiameter) parts.push('Διόρθωσε ή καθάρισε τη γνωστή διάμετρο.');
    if (ready < MIN_PHOTOS) parts.push('Ετοίμασε τουλάχιστον 2 φωτογραφίες με κάρτα και άκρη.');
    if (importing || loadingPreview) parts.push('Περίμενε να διαβαστούν οι φωτογραφίες.');
    if (parts.length === 0) parts.push(`Έτοιμες φωτογραφίες για τον υπολογισμό · ${ready} από ${records.length}.`);
  }
  setText(measureStatus, parts.join(' '));
}

function clearResult() {
  outcome = null;
  originalSummary = '';
  resultDetails.hidden = true;
  resultDetails.replaceChildren();
  summaryArea.hidden = true;
  summaryText.value = '';
  summaryDisclosure.open = false;
  setText(copyStatus, '');
}

function updateActive() {
  activeSection.hidden = !active;
  if (!active) return;
  const { photo } = active;
  setText(byId('photo-title'), photoName(photo.id));
  const size = photo.width && photo.height ? `${photo.width} × ${photo.height} px` : 'Διαστάσεις μη διαθέσιμες';
  const focal = focal35ToPixels(photo.focal35Mm, photo.width, photo.height);
  const focalReadout = focal === null
    ? ' · Χωρίς εστιακή στο αρχείο'
    : ` · Εστιακή από το αρχείο ${display.format(focal)} px · Ισοδύναμη 35 mm ${display.format(photo.focal35Mm)} mm`;
  setText(byId('photo-meta'), size + focalReadout);

  const message = photoIssue(photo) || (loadingPreview ? 'Φορτώνω την εικόνα…' : '');
  setText(byId('preview-message'), message);
  activeSection.setAttribute('aria-busy', String(loadingPreview));
}

async function openPhoto(record) {
  const request = ++previewRequest;
  active = record;
  loadingPreview = !!record?.preview;
  updateActive();
  editor.setPhoto(record?.photo ?? null, null);
  if (!loadingPreview) return;
  try {
    const preview = await decodePreview(record.preview);
    if (request !== previewRequest) return;
    editorTools.hidden = false;
    editor.setPhoto(record.photo, preview);
  } catch {
    if (request !== previewRequest) return;
    record.photo.decodeFailed = true;
    record.preview = null;
    clearResult();
  } finally {
    if (request === previewRequest) {
      loadingPreview = false;
      updateActive();
    }
    updateControls();
  }
}

function appendPhoto(record) {
  const row = document.createElement('li');
  const button = document.createElement('button');
  const name = document.createElement('span');
  const status = document.createElement('small');
  button.type = 'button';
  button.setAttribute('aria-controls', 'active-photo');
  name.textContent = photoName(record.photo.id);
  button.append(name, status);
  row.append(button);
  photoList.append(row);
  button.addEventListener('click', () => {
    if (!calculating && active !== record) void openPhoto(record);
  });
  records.push(Object.assign(record, { row, button, status }));
}

// The capture guide supplies Blobs in fan order. Keep annotations on shots
// whose Blob did not change, and discard any late work on deleted inputs.
export async function setGuideInputs({ shots, diameterText, visible, wrapSummary }) {
  const wasShown = guideShown;
  const sameShots = shots.length === guideShots.length && shots.every((shot, index) => shot === guideShots[index]);
  const sameDiameter = parseDiameter(diameter.value) === parseDiameter(diameterText);
  wrapGuideSummary = wrapSummary;
  guideShown = visible;
  if (wasShown && !visible) {
    guideSelectedId = active?.photo.id;
    void openPhoto(null);
  }
  if (sameShots && sameDiameter) {
    if (visible && !wasShown && !importing) {
      await openPhoto(records.find(record => record.photo.id === guideSelectedId) ?? records[0]);
      updateControls();
    }
    if (visible && originalSummary) summaryText.value = wrapGuideSummary(originalSummary);
    return;
  }

  diameter.value = diameterText;
  clearResult();
  if (sameShots && !calculating) {
    updateControls();
    return;
  }

  const epoch = ++guideInputEpoch;
  guideShots = shots;
  const reusable = new Map(records.map(record => [record.source, record]));
  const selectedId = active?.photo.id ?? guideSelectedId;
  void openPhoto(null);
  for (const record of records) record.row.remove();
  records.length = 0;
  calculating = false;
  editor.setLocked(false);
  if (!sameShots) confirmLens.checked = false;
  if (!shots.length) confirmCard.checked = false;
  importing = shots.length > 0;
  updateControls();

  for (const shot of shots) {
    const previous = reusable.get(shot);
    const record = previous ?? await preparePhoto(shot.blob, shot.number);
    if (epoch !== guideInputEpoch) return;
    if (previous) {
      records.push(previous);
      photoList.append(previous.row);
    } else {
      appendPhoto(Object.assign(record, { source: shot }));
    }
  }
  importing = false;
  setText(byId('photo-message'), shots.length ? 'Λήψεις της βεντάλιας · ' + shots.length : 'Δεν υπάρχουν λήψεις βεντάλιας.');
  if (guideShown) {
    const selected = records.find(record => record.photo.id === selectedId && record.preview);
    await openPhoto(selected ?? records.find(record => record.preview) ?? records[0]);
  }
  updateControls();
}

addPhotos.addEventListener('click', () => {
  if (!importing && !calculating && records.length < MAX_PHOTOS) picker.click();
});

picker.addEventListener('change', async () => {
  const selected = [...picker.files];
  picker.value = '';
  if (selected.length === 0 || importing || calculating) return;
  const available = MAX_PHOTOS - records.length;
  const admitted = selected.slice(0, available);
  if (admitted.length === 0) return;
  clearResult();
  confirmLens.checked = false;
  importing = true;
  updateControls();
  const added = [];
  for (const file of admitted) {
    const record = await preparePhoto(file, nextId++);
    appendPhoto(record);
    added.push(record);
    updateControls();
  }
  importing = false;
  const capped = admitted.length < selected.length ? ' Προστέθηκαν όσες χωρούσαν στο όριο των 10.' : '';
  setText(byId('photo-message'), `Φωτογραφίες στη σελίδα · ${records.length} από ${MAX_PHOTOS}.${capped}`);
  updateControls();
  if (!active) {
    const firstUsable = added.find(record => !!record.preview);
    await openPhoto(firstUsable ?? added[0]);
  }
});

removePhoto.addEventListener('click', () => {
  if (!active || importing || calculating) return;
  clearResult();
  const index = records.indexOf(active);
  active.row.remove();
  records.splice(index, 1);
  const replacement = records[index] ?? records[index - 1] ?? null;
  setText(byId('photo-message'), `Φωτογραφίες στη σελίδα · ${records.length} από ${MAX_PHOTOS}.`);
  void openPhoto(replacement);
  const focusTarget = replacement?.button ?? addPhotos;
  focusTarget.focus({ preventScroll: true });
});

const editor = createEditor(canvas, pointsChanged => {
  if (pointsChanged) clearResult();
  updateEditor(pointsChanged);
  updateControls();
});

function updateReference() {
  clearResult();
  updateControls();
}

confirmCard.addEventListener('change', updateReference);
confirmLens.addEventListener('change', updateReference);
diameter.addEventListener('input', updateReference);
markCard.addEventListener('click', () => editor.setMode('cornersPx'));
markEdge.addEventListener('click', () => editor.setMode('edgePx'));
zoomIn.addEventListener('click', () => editor.zoomBy(2));
zoomOut.addEventListener('click', () => editor.zoomBy(0.5));
fitPhoto.addEventListener('click', editor.fit);
previousPoint.addEventListener('click', () => editor.selectStep(-1));
nextPoint.addEventListener('click', () => editor.selectStep(1));
clearSelection.addEventListener('click', editor.deselect);
deletePoint.addEventListener('click', editor.removePoint);
undoPoint.addEventListener('click', editor.undo);
for (const button of panButtons) {
  const [x, y] = button.dataset.pan.split(',').map(Number);
  button.addEventListener('click', () => editor.panBy(x, y));
}

function inWorker(input) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./measure-worker.mjs', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }) => {
      worker.terminate();
      resolve(data);
    }, { once: true });
    const failed = event => {
      event.preventDefault();
      worker.terminate();
      reject(new Error('Ο υπολογισμός στο παρασκήνιο δεν ήταν διαθέσιμος.'));
    };
    worker.addEventListener('error', failed, { once: true });
    worker.addEventListener('messageerror', failed, { once: true });
    try {
      worker.postMessage(input);
    } catch (error) {
      worker.terminate();
      reject(error);
    }
  });
}

async function runMeasurement(included, sameLensConfirmed) {
  try {
    return await inWorker({ included, sameLensConfirmed });
  } catch {
    // Δώσε στον browser χρόνο να δείξει την κατάσταση πριν τρέξει ο πυρήνας εδώ.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return calculateMeasurement(included, sameLensConfirmed);
  }
}

measure.addEventListener('click', async () => {
  if (calculating || importing || loadingPreview) return;
  const knownDiameterMm = parseDiameter(diameter.value);
  const cardConfirmed = confirmCard.checked;
  const sameLensConfirmed = confirmLens.checked;
  const photos = records.map(record => record.photo);
  const included = prepareMeasurement(photos, cardConfirmed);
  if (Number.isNaN(knownDiameterMm) || included === null) return;

  const measurementEpoch = guideInputEpoch;
  clearResult();
  calculating = true;
  editor.setLocked(true);
  updateEditor(false);
  updateControls();
  let result;
  try {
    result = await runMeasurement(included, sameLensConfirmed);
  } catch {
    result = { ok: false, code: 'CALCULATION_ERROR' };
  }
  if (measurementEpoch !== guideInputEpoch) return;
  calculating = false;
  editor.setLocked(false);
  outcome = result;
  renderResult(resultDetails, result, included, knownDiameterMm);
  resultDetails.hidden = false;
  originalSummary = createSummary({ photos, included, cardConfirmed, sameLensConfirmed, knownDiameterMm, result });
  summaryText.value = wrapGuideSummary(originalSummary);
  summaryArea.hidden = false;
  updateEditor(false);
  updateControls();
});

copySummary.addEventListener('click', async () => {
  if (!outcome || copying) return;
  const text = summaryText.value;
  copying = true;
  copySummary.setAttribute('aria-busy', 'true');
  copySummary.setAttribute('aria-disabled', 'true');
  setText(copySummary, 'Αντιγράφω τη σύνοψη…');
  setText(copyStatus, '');
  try {
    await navigator.clipboard.writeText(text);
    if (text === summaryText.value) setText(copyStatus, 'Η σύνοψη αντιγράφηκε.');
  } catch {
    if (text === summaryText.value) {
      summaryDisclosure.open = true;
      summaryText.focus();
      summaryText.select();
      setText(copyStatus, 'Επίλεξε το κείμενο της σύνοψης και χρησιμοποίησε την αντιγραφή της συσκευής.');
    }
  } finally {
    copying = false;
    copySummary.setAttribute('aria-busy', 'false');
    copySummary.setAttribute('aria-disabled', 'false');
    setText(copySummary, 'Αντιγραφή σύνοψης');
  }
});

updateControls();
