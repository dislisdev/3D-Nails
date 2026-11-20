import { describeError, probeFile, ProbeError, readEnvironment, waitFor } from './browser.mjs';
import { probeSpeed } from './benchmark.mjs';
import { probeCameraList, probeSelectedCamera } from './camera.mjs';
import { canChooseMain } from './camera-labels.mjs';
import { DISTANCES_CM, DISTANCE_CAMERAS, probeDistance, SAME_SCENE } from './distance.mjs';
import { probePhoto } from './photo.mjs';
import { probeTilt } from './sampling.mjs';
import { FILE_SOURCES, formatDistanceScores, formatDistanceStatus, formatMainStatus, formatStepStatus, formatSummary } from './summary.mjs';

const copyId = 'copy';
const fileId = 'file';
const busyLabels = {
  live: 'Έλεγχος κάμερας σε εξέλιξη',
  photo: 'Λήψη σε εξέλιξη',
  speed: 'Μέτρηση ταχύτητας σε εξέλιξη',
  file: 'Ανάγνωση φωτογραφίας σε εξέλιξη',
  tilt: 'Μέτρηση κλίσης σε εξέλιξη',
  copy: 'Αντιγραφή σε εξέλιξη',
};
const retryLabels = {
  live: 'Ξαναδοκίμασε την κάμερα',
  photo: 'Ξανατράβηξε από τη ροή',
  speed: 'Ξαναμέτρησε την ταχύτητα',
  file: 'Άνοιξε ξανά την κάμερα του τηλεφώνου',
  tilt: 'Ξαναμέτρησε την κλίση',
};
const controls = new Map(
  Array.from(document.querySelectorAll('button[data-step]'), (button) => {
    const id = button.dataset.step;
    return [id, {
      button,
      label: button.textContent,
      panel: document.getElementById(`step-${id}`),
      help: document.getElementById(`help-${id}`),
      status: document.getElementById(`status-${id}`),
      preview: document.getElementById(`preview-${id}`),
    }];
  }),
);
const report = document.getElementById('report-text');
const pickFile = document.getElementById('pick-file');
const filePickers = [
  { input: document.getElementById('capture-file'), button: controls.get(fileId).button },
  { input: document.getElementById('browse-file'), button: pickFile },
];
const fileSource = document.getElementById('file-source');
const sourceRadios = ['source-library', 'source-files', 'source-capture'].map((id) => document.getElementById(id));
const livePreview = controls.get('live').preview;
const cameraDetails = document.getElementById('camera-details');
const cameraChoices = document.getElementById('camera-choices');
const cameraList = document.getElementById('camera-list');
const mainStatus = document.getElementById('status-main-camera');
const openMain = document.getElementById('open-main-camera');
const distancePanel = document.getElementById('step-distance');
const distanceControls = document.getElementById('distance-controls');
const distanceActions = document.getElementById('distance-actions');
const distancePreview = document.getElementById('preview-distance');
const distanceStatus = document.getElementById('status-distance');
const distanceTable = document.getElementById('distance-table');
const distanceRows = document.getElementById('distance-rows');
const roles = Object.keys(DISTANCE_CAMERAS);
const distanceRadios = roles.map((role) => document.getElementById(`distance-${role}`));
const distanceCameras = {};
const distanceOptions = DISTANCES_CM.map((cm) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-describedby', 'help-distance status-distance');
  distanceActions.append(button);
  const row = document.createElement('tr');
  const heading = document.createElement('th');
  heading.scope = 'row';
  heading.textContent = `${cm} cm`;
  const cells = roles.map(() => document.createElement('td'));
  row.append(heading, ...cells);
  distanceRows.append(row);
  return { cm, button, cells };
});
const actions = {
  live: checkCameras,
  photo: (signal) => probePhoto(controls.get('photo').preview, signal, results.live),
  speed: (signal, progress) => probeSpeed(controls.get('speed').preview, signal, results.live, progress),
  tilt: probeTilt,
  copy: copySummary,
};

let results = {};
let running;
let copyFeedback = '';
let summaryDate = new Date();
let catalog;
let manualCamera;
let distanceRole = 'main';
let lastDistance;

function renderSummary() {
  results.environment = readEnvironment();
  const text = formatSummary(results, summaryDate);
  if (report.textContent !== text) report.textContent = text;
}

function putText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function renderButton(button, label, busyLabel, primary, disabled = false) {
  const busy = running?.button === button;
  button.dataset.variant = primary ? 'primary' : 'secondary';
  button.disabled = disabled || Boolean(running && !busy);
  if (primary) button.setAttribute('aria-current', 'step');
  else button.removeAttribute('aria-current');
  if (busy) {
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-disabled', 'true');
  } else {
    button.removeAttribute('aria-busy');
    button.removeAttribute('aria-disabled');
  }
  putText(button, busy ? busyLabel : label);
}

function replaceCameraList(nextCatalog) {
  catalog = nextCatalog;
  manualCamera = undefined;
  const items = (catalog?.cameras ?? []).map((camera, index) => {
    const item = document.createElement('li');
    if (catalog.main || !canChooseMain(camera)) {
      item.textContent = camera.label ?? 'δεν δίνεται ετικέτα';
      return item;
    }
    const label = document.createElement('label');
    label.className = 'choice';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'main-camera';
    const text = document.createElement('span');
    text.textContent = camera.label ?? 'Κάμερα χωρίς ετικέτα';
    if (!camera.label || catalog.cameras.some((other) => other !== camera && other.label === camera.label)) {
      const position = document.createElement('span');
      position.className = 'visually-hidden';
      position.textContent = `, θέση ${index + 1}`;
      text.append(position);
    }
    radio.addEventListener('change', () => {
      if (running || !radio.checked) return;
      manualCamera = camera;
      render();
    });
    label.append(radio, text);
    item.append(label);
    return item;
  });
  cameraList.replaceChildren(...items);
}

async function checkCameras(signal, progress) {
  const { live, catalog: nextCatalog } = await probeCameraList(livePreview, signal, progress);
  signal.throwIfAborted();
  replaceCameraList(nextCatalog);
  setDistanceCamera('main', live.main?.state === 'done' ? nextCatalog.main : undefined);
  setDistanceCamera('triple', nextCatalog?.triple);
  return live;
}

function setDistanceCamera(role, camera) {
  if (distanceCameras[role]?.deviceId !== camera?.deviceId) {
    if (results.distance) delete results.distance[role];
    if (lastDistance?.role === role) lastDistance = undefined;
  }
  distanceCameras[role] = camera;
  if (!distanceCameras[distanceRole]) distanceRole = roles.find((key) => distanceCameras[key]) ?? 'main';
}

function nextDistanceFor(role) {
  if (!distanceCameras[role]) return undefined;
  return distanceOptions.find(({ cm }) => !results.distance?.[role]?.[cm]);
}

function renderDistance(primary, current, nextDistance) {
  const available = Boolean(distanceCameras[distanceRole]);
  distancePanel.hidden = !results.live;
  distancePanel.toggleAttribute('data-current', current);
  distanceControls.hidden = !available;
  distanceTable.hidden = !roles.some((role) => results.distance?.[role]);
  for (const [index, role] of roles.entries()) {
    const radio = distanceRadios[index];
    radio.disabled = Boolean(running || !distanceCameras[role]);
    radio.checked = role === distanceRole && available;
  }
  for (const { cm, button, cells } of distanceOptions) {
    const previous = results.distance?.[distanceRole]?.[cm];
    const label = previous ? 'Ξαναμέτρησε' : 'Μέτρησε';
    renderButton(button, `${label} στα ${cm} cm`, `Μέτρηση στα ${cm} cm σε εξέλιξη`, primary === button, !available);
    for (const [index, role] of roles.entries()) {
      putText(cells[index], formatDistanceScores(results.distance?.[role]?.[cm]));
    }
  }
  let status = lastDistance ? formatDistanceStatus(lastDistance) : '';
  if (running?.id === 'distance') status = 'Σε εξέλιξη · Άνοιγμα της κάμερας.';
  else if (!available) status = 'Δεν υπάρχει διαθέσιμη κάμερα για μέτρηση.';
  else if (!distanceCameras.triple) status = `${status} Η τριπλή πίσω κάμερα δεν αναγνωρίστηκε.`.trim();
  else if (!nextDistance && roles.some((role) => role !== distanceRole && nextDistanceFor(role))) {
    status = `${status} Διάλεξε την άλλη κάμερα για τις υπόλοιπες αποστάσεις.`.trim();
  }
  putText(distanceStatus, status);
}

function render() {
  const main = results.live?.main;
  const manual = Boolean(catalog && !catalog.main && catalog.cameras.some(canChooseMain));
  const awaitingChoice = manual && main?.state !== 'done';
  const nextDistance = nextDistanceFor(distanceRole);
  const nextStep = Array.from(controls.keys()).find((id) => id !== copyId && !results[id]) ?? copyId;
  const next = running?.id ?? (awaitingChoice ? 'live' : nextDistance ? 'distance' : nextStep);
  const primary = running?.button ?? (awaitingChoice ? openMain : nextDistance?.button ?? controls.get(nextStep).button);
  for (const [id, { button, label, panel, help, status }] of controls) {
    const current = next === id;
    panel.toggleAttribute('data-current', current);
    help.hidden = !current;
    button.setAttribute('aria-describedby', current ? `${help.id} ${status.id}` : status.id);
    const idleLabel = results[id] ? retryLabels[id] : label;
    renderButton(button, idleLabel, busyLabels[id], primary === button);
    const message = id === copyId ? copyFeedback : formatStepStatus(id, results[id]);
    const busy = running?.id === id && running.button !== openMain;
    putText(status, busy ? 'Σε εξέλιξη.' : message);
  }
  cameraDetails.hidden = !catalog;
  cameraChoices.hidden = !catalog?.cameras.length;
  cameraChoices.disabled = Boolean(running);
  openMain.hidden = !manual;
  const retryMain = main?.request ? 'Ξανάνοιξε τον φακό' : 'Άνοιξε τον φακό';
  renderButton(openMain, retryMain, 'Άνοιγμα φακού σε εξέλιξη', primary === openMain,
    !manualCamera);
  putText(mainStatus, running?.button === openMain ? 'Σε εξέλιξη.' : formatMainStatus(main));
  renderDistance(primary, next === 'distance', nextDistance);
  renderButton(pickFile, results.file ? 'Διάλεξε άλλη φωτογραφία' : 'Διάλεξε φωτογραφία',
    busyLabels.file, primary === pickFile);
  const selectedFile = results.file;
  fileSource.hidden = !Number.isFinite(selectedFile?.bytes);
  for (const [index, radio] of sourceRadios.entries()) {
    radio.disabled = Boolean(running) || fileSource.hidden;
    radio.checked = selectedFile?.source === FILE_SOURCES[index];
  }
  renderSummary();
}

function recordStepResult(id, result) {
  results[id] = result;
  copyFeedback = '';
  summaryDate = new Date();
}

async function runStep(id, action, button = controls.get(id).button, save = (result) => recordStepResult(id, result)) {
  if (running) return;
  const task = { id, button, controller: new AbortController() };
  running = task;
  render();
  const status = id === 'distance' ? distanceStatus : button === openMain ? mainStatus : controls.get(id).status;
  const progress = (message) => {
    if (running === task) putText(status, `Σε εξέλιξη · ${message}`);
  };

  let result;
  try {
    result = await action(task.controller.signal, progress);
  } catch (error) {
    result = describeError(error, 'Η δοκιμή διακόπηκε από τον browser. Μπορείς να ξαναδοκιμάσεις.');
  }
  if (running !== task) return;

  if (id === copyId) copyFeedback = result.message;
  else save(result);
  running = undefined;
  render();
}

async function copySummary(signal) {
  const text = report.textContent;
  let message = 'Δεν έγινε αντιγραφή από τον browser.';
  try {
    if (typeof navigator.clipboard?.writeText === 'function') {
      await waitFor(navigator.clipboard.writeText(text), signal, { timeoutMs: 3000 });
      return { message: 'Η σύνοψη αντιγράφηκε.' };
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof ProbeError && error.state === 'timeout') {
      message = 'Η αντιγραφή δεν απάντησε μέσα σε τρία δευτερόλεπτα.';
    }
  }

  let selected = false;
  try {
    report.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(report);
      selection.removeAllRanges();
      selection.addRange(range);
      selected = true;
    }
  } catch {
    // Το κείμενο μένει διαθέσιμο για χειροκίνητη επιλογή.
  }
  const instruction = selected
    ? 'Χρησιμοποίησε την αντιγραφή του κινητού στο επιλεγμένο κείμενο.'
    : 'Επίλεξε το κείμενο της σύνοψης και αντέγραψέ το.';
  return { message: `${message} ${instruction}` };
}

for (const [id, { button }] of controls) {
  if (id in actions) button.addEventListener('click', () => { void runStep(id, actions[id]); });
}

openMain.addEventListener('click', () => {
  if (running || !manualCamera) return;
  void runStep('live', async (signal) => {
    const main = await probeSelectedCamera(manualCamera, livePreview, signal);
    signal.throwIfAborted();
    setDistanceCamera('main', main.state === 'done' ? manualCamera : undefined);
    if (main.state === 'done') distanceRole = 'main';
    return { ...results.live, main };
  }, openMain);
});

putText(document.getElementById('distance-scene'), SAME_SCENE);
for (const [index, radio] of distanceRadios.entries()) {
  radio.addEventListener('change', () => {
    if (running || !radio.checked) return;
    distanceRole = roles[index];
    render();
  });
}

for (const { cm, button } of distanceOptions) {
  button.addEventListener('click', () => {
    const role = distanceRole;
    const camera = distanceCameras[role];
    if (running || !camera) return;
    void runStep('distance', (signal, progress) => probeDistance(camera, role, cm, distancePreview, signal, progress),
      button, (reading) => {
        lastDistance = { ...reading, role, cm };
        const distances = results.distance ?? {};
        (distances[role] ??= {})[cm] = lastDistance;
        recordStepResult('distance', distances);
      });
  });
}

function fileCanceled() {
  if (running) return;
  recordStepResult(fileId, { state: 'canceled', message: 'Δεν επιλέχθηκε φωτογραφία.' });
  render();
}

for (const { input, button } of filePickers) {
  button.addEventListener('click', () => {
    if (running) return;
    try {
      input.click();
    } catch {
      recordStepResult(fileId, { state: 'error', message: 'Ο browser δεν άνοιξε την επιλογή φωτογραφίας.' });
      render();
    }
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) void runStep(fileId, (signal) => probeFile(file, signal), button);
    else fileCanceled();
  });
  input.addEventListener('cancel', fileCanceled);
}

for (const [index, radio] of sourceRadios.entries()) {
  radio.addEventListener('change', () => {
    if (running || !radio.checked || !Number.isFinite(results.file?.bytes)) return;
    recordStepResult(fileId, { ...results.file, source: FILE_SOURCES[index] });
    render();
  });
}
window.addEventListener('resize', renderSummary);
window.addEventListener('pagehide', () => {
  running?.controller.abort();
  running = undefined;
  results = {};
  replaceCameraList(undefined);
  for (const role of roles) setDistanceCamera(role, undefined);
  copyFeedback = '';
  summaryDate = new Date();
  for (const { input } of filePickers) input.value = '';
  render();
});

render();
document.getElementById('load-error').hidden = true;
