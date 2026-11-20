import { describeError, probeFile, ProbeError, readEnvironment, waitFor } from './browser.mjs';
import { probeSpeed } from './benchmark.mjs';
import { probeLive } from './camera.mjs';
import { probePhoto } from './photo.mjs';
import { probeTilt } from './sampling.mjs';
import { formatStepStatus, formatSummary } from './summary.mjs';

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
const fileInput = document.getElementById('capture-file');
const report = document.getElementById('report-text');
const actions = {
  live: (signal, progress) => probeLive(controls.get('live').preview, signal, progress),
  photo: (signal) => probePhoto(controls.get('photo').preview, signal, results.live),
  speed: (signal, progress) => probeSpeed(controls.get('speed').preview, signal, results.live, progress),
  tilt: probeTilt,
  copy: copySummary,
};

let results = {};
let running;
let copyFeedback = '';
let summaryDate = new Date();

function renderSummary() {
  results.environment = readEnvironment();
  const text = formatSummary(results, summaryDate);
  if (report.textContent !== text) report.textContent = text;
}

function putText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function render() {
  const next = running?.id ?? Array.from(controls.keys()).find((id) => id !== copyId && !results[id]) ?? copyId;
  for (const [id, { button, label, panel, help, status }] of controls) {
    const busy = running?.id === id;
    const current = next === id;
    panel.toggleAttribute('data-current', current);
    help.hidden = !current;
    button.dataset.variant = current ? 'primary' : 'secondary';
    button.disabled = Boolean(running && !busy);
    if (current) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
    if (busy) {
      button.setAttribute('aria-busy', 'true');
      button.setAttribute('aria-disabled', 'true');
    } else {
      button.removeAttribute('aria-busy');
      button.removeAttribute('aria-disabled');
    }
    button.setAttribute('aria-describedby', current ? `${help.id} ${status.id}` : status.id);
    const idleLabel = results[id] ? retryLabels[id] : label;
    putText(button, busy ? busyLabels[id] : idleLabel);
    const message = id === copyId ? copyFeedback : formatStepStatus(id, results[id]);
    putText(status, busy ? 'Σε εξέλιξη.' : message);
  }
  renderSummary();
}

function recordStepResult(id, result) {
  results[id] = result;
  copyFeedback = '';
  summaryDate = new Date();
}

async function runStep(id, action) {
  if (running) return;
  const task = { id, controller: new AbortController() };
  running = task;
  render();
  const progress = (message) => {
    if (running === task) putText(controls.get(id).status, `Σε εξέλιξη · ${message}`);
  };

  let result;
  try {
    result = await action(task.controller.signal, progress);
  } catch (error) {
    result = describeError(error, 'Η δοκιμή διακόπηκε από τον browser. Μπορείς να ξαναδοκιμάσεις.');
  }
  if (running !== task) return;

  if (id === copyId) copyFeedback = result.message;
  else recordStepResult(id, result);
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
  button.addEventListener('click', () => {
    if (running) return;
    if (id === fileId) {
      try {
        fileInput.click();
      } catch {
        recordStepResult(fileId, { state: 'error', message: 'Ο browser δεν άνοιξε την επιλογή φωτογραφίας.' });
        render();
      }
    } else if (id in actions) {
      void runStep(id, actions[id]);
    }
  });
}

function fileCanceled() {
  if (running) return;
  recordStepResult(fileId, { state: 'canceled', message: 'Δεν επιλέχθηκε φωτογραφία.' });
  render();
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void runStep(fileId, (signal) => probeFile(file, signal));
  else fileCanceled();
});
fileInput.addEventListener('cancel', fileCanceled);
window.addEventListener('resize', renderSummary);
window.addEventListener('pagehide', () => {
  running?.controller.abort();
  running = undefined;
  results = {};
  copyFeedback = '';
  summaryDate = new Date();
  fileInput.value = '';
  render();
});

render();
document.getElementById('load-error').hidden = true;
