// Πειραματικό · Οδηγός λήψης 0.1.0 · καθοδήγηση του πακέτου G1.
import { createAnnouncer } from './announcements.mjs';
import { parseDiameter } from './bench/views.mjs';
import { isCompositeCamera } from './capture.mjs';
import { createCameraListbox } from './camera-listbox.mjs';
import { captureGuidance, headingAgainstFan, PHOTO_STEPS, shotsFor } from './guide-model.mjs';
import { CAPTURE_RULES } from './targets.mjs';
import { CAPTURE_TEXT, PLACEMENT, RESULT_TEXT, SENSOR_TEXT, STEP_TITLES } from './texts.mjs';

const display = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1, useGrouping: false });
const angle = amount => Number.isFinite(amount) ? display.format(amount) + '°' : '—';
const edges = { straight: 'Ίσια άκρη', rounded: 'Στρογγυλεμένη άκρη', unknown: 'Άγνωστη άκρη' };

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function busy(button, enabled, label, waiting) {
  button.setAttribute('aria-busy', String(enabled));
  button.setAttribute('aria-disabled', String(enabled || button.disabled));
  setText(button, enabled ? waiting : label);
}

function sectionSummary(state, step) {
  if (step === 1) {
    if (state.subject === 'nail') return 'Νύχι · ' + edges[state.edge];
    return state.knownDiameterMm === null ? 'Αντικείμενο' : 'Αντικείμενο · Διάμετρος ' + state.knownDiameterMm + ' mm';
  }
  if (step === 2) {
    const camera = state.cameraMode === 'file' ? 'Κάμερα του κινητού' : state.cameraInfo?.label ?? 'Ζωντανή κάμερα';
    const sensor = state.sensor.status === 'active' ? 'Με ένδειξη γωνίας' : 'Χωρίς ένδειξη γωνίας';
    return camera + ' · ' + sensor;
  }
  if (PHOTO_STEPS[step]) {
    const count = shotsFor(state, step).length;
    return count === 1 ? '1 λήψη' : count + ' λήψεις';
  }
  if (step === 6) return state.photos.size + ' φωτογραφίες';
  return '';
}

export function mountGuide({ document, guide, clock, demo = false, onState = () => {} }) {
  const byId = id => document.getElementById(id);
  const { state } = guide;
  const sections = [...document.querySelectorAll('.guide-step')];
  const progress = [...byId('progress').children];
  const preview = byId('live-preview');
  const station = byId('capture-station');
  const prep = byId('prep-form');
  const dialog = byId('confirm-action');
  const live = byId('live-announcement');
  const announcer = createAnnouncer(clock, message => setText(live, message));
  const noDevices = [];
  let activeStep;
  let announcedShot;
  let confirmAction;
  let dialogInvoker;

  byId('demo-label').hidden = !demo;
  byId('fake-video').hidden = !demo;
  byId('live-video').hidden = demo;
  for (const item of document.querySelectorAll('[data-placement]')) {
    setText(item, PLACEMENT[item.dataset.placement]);
  }
  setText(byId('experimental-result'), RESULT_TEXT.experimental);

  const listbox = createCameraListbox({
    document, list: byId('camera-list'), choose: id => void guide.openCamera(id),
    clock,
    typeaheadMs: parseFloat(document.defaultView.getComputedStyle(document.documentElement).getPropertyValue('--duration-typeahead')),
  });

  function valueOf(name) {
    return prep.querySelector('input[name="' + name + '"]:checked')?.value;
  }

  function renderPrep() {
    const isNail = valueOf('subject') === 'nail';
    byId('object-fields').hidden = isNail;
    byId('nail-fields').hidden = !isNail;
    setText(byId('subject-placement'), isNail ? PLACEMENT.nail : PLACEMENT.object);
  }

  function clearPrepError() {
    setText(byId('prep-error'), '');
    for (const field of ['known-diameter', 'edge-field', 'consent']) byId(field).removeAttribute('aria-invalid');
  }

  function confirm({ title, message, label, action }) {
    if (dialog.open) return;
    if (typeof dialog.showModal !== 'function') {
      if (document.defaultView.confirm(message)) action();
      return;
    }
    setText(byId('confirm-title'), title);
    setText(byId('confirm-message'), message);
    setText(byId('confirm-button'), label);
    confirmAction = action;
    dialogInvoker = document.activeElement;
    guide.pauseAutoCapture(true);
    dialog.showModal();
  }

  function submitPrep(event) {
    event.preventDefault();
    const subject = valueOf('subject');
    const edge = valueOf('edge');
    const diameter = byId('known-diameter').value;
    const consent = byId('consent').checked;
    clearPrepError();
    if (subject === 'object' && Number.isNaN(parseDiameter(diameter))) {
      byId('known-diameter').setAttribute('aria-invalid', 'true');
      setText(byId('prep-error'), 'Η διάμετρος δεν διαβάστηκε. Γράψε θετικό αριθμό σε mm ή άφησε το πεδίο κενό.');
      byId('known-diameter').focus();
      return;
    }
    if (subject === 'nail' && !edge) {
      byId('edge-field').setAttribute('aria-invalid', 'true');
      setText(byId('prep-error'), 'Λείπει η επιλογή για την άκρη. Διάλεξε πώς είναι κομμένη ή πάτησε «Δεν ξέρω».');
      byId('edge-field').querySelector('input').focus();
      return;
    }
    if (subject === 'nail' && !consent) {
      byId('consent').setAttribute('aria-invalid', 'true');
      setText(byId('prep-error'), 'Λείπει η συμφωνία για τη λήψη. Σημείωσε το κουτάκι αν υπάρχει συμφωνία.');
      byId('consent').focus();
      return;
    }
    const action = () => guide.prepare({ subject, edge, diameter, consent });
    if (state.photos.size && state.subject !== subject) {
      confirm({
        title: 'Άλλαξε τι μετράς',
        message: 'Αν αλλάξεις τι μετράς, θα σβήσουν οι φωτογραφίες της προηγούμενης δοκιμής.',
        label: 'Άλλαξε και σβήσε τις λήψεις', action,
      });
    } else {
      action();
    }
  }

  function moveElement(element, mount) {
    if (element.parentElement === mount) return;
    if (typeof mount.moveBefore === 'function') mount.moveBefore(element, null);
    else mount.append(element);
  }

  function mountPreview(mount, visible, reticle) {
    if (visible) moveElement(preview, mount);
    preview.hidden = !visible;
    const size = state.cameraInfo?.preview;
    preview.toggleAttribute('data-portrait', size && size.height > size.width);
    byId('reticle').hidden = !reticle;
    if (visible && state.cameraMode === 'live') guide.resumeVideo();
  }

  function renderCamera() {
    const liveCamera = state.cameraMode === 'live';
    const opening = state.cameraMode === 'opening';
    const fileMode = state.cameraMode === 'file';
    mountPreview(byId('camera-preview-mount'), liveCamera || opening, false);
    const button = byId('open-camera');
    const moveFocus = document.activeElement === button && liveCamera;
    button.hidden = liveCamera;
    busy(button, opening, 'Άνοιξε την πίσω κάμερα', 'Περιμένω την κάμερα…');
    byId('file-mode').hidden = liveCamera || fileMode;
    const { preview: size, label, devices, selectedId } = state.cameraInfo ?? {};
    let message = opening ? 'Δώσε άδεια κάμερας αν το ζητήσει ο browser.' : '';
    if (liveCamera && size) message = (label ? label + ' · ' : '') + size.width + ' × ' + size.height + ' px στη ζωντανή εικόνα';
    if (fileMode) message = CAPTURE_TEXT.file;
    setText(byId('camera-status'), message);
    setText(byId('camera-error'), state.cameraError);
    byId('camera-choices').hidden = !(liveCamera || opening) || !devices?.length;
    listbox(devices ?? noDevices, selectedId, opening);
    const composite = liveCamera && isCompositeCamera(label);
    byId('camera-lens-note').hidden = !composite;
    setText(byId('camera-lens-note'), composite ? CAPTURE_TEXT.composite : '');
    byId('continue-camera').disabled = !(liveCamera || fileMode);
    if (moveFocus) (devices?.length ? byId('camera-list') : byId('request-sensor')).focus({ preventScroll: true });

    const sensor = state.sensor.status;
    const request = byId('request-sensor');
    request.hidden = sensor === 'active' || sensor === 'unavailable';
    busy(request, sensor === 'requesting', 'Άνοιξε την ένδειξη γωνίας', 'Περιμένω την άδεια…');
    byId('skip-sensor').hidden = ['skipped', 'denied', 'unavailable'].includes(sensor);
    setText(byId('sensor-status'), SENSOR_TEXT[sensor]);
    for (const [position, check] of Object.entries(state.sensor.checks)) {
      const sample = guide.latestSample();
      byId('check-' + position).disabled = !sample;
      const readout = check.state === 'measured'
        ? 'Διάβασε ' + angle(check.observed) + ' · Αναμενόμενο ' + angle(check.expected)
        : 'Αναμενόμενο ' + angle(check.expected) +
          (state.completed.has(2) || ['skipped', 'denied', 'unavailable', 'no-data'].includes(sensor) ? ' · Παραλείφθηκε' : '');
      setText(byId('read-' + position), readout);
    }
  }

  function drawGuidance() {
    const slot = guide.currentSlot();
    if (!slot) return;
    const sample = state.cameraMode === 'live' ? guide.latestSample() : null;
    const meter = byId('angle-meter');
    meter.hidden = !sample;
    const instruction = captureGuidance(state, slot, sample);
    setText(byId('angle-now'), angle(sample?.elevation));
    setText(byId('capture-instruction'), instruction);
    if (sample) {
      const { min, max, elevation } = slot.target;
      meter.min = Math.max(-90, min - 15);
      meter.max = Math.min(90, max + 15);
      meter.low = min;
      meter.high = Math.min(90, max);
      meter.optimum = elevation;
      meter.value = sample.elevation;
      meter.setAttribute('aria-valuetext', angle(sample.elevation));
    }
    const turn = headingAgainstFan(sample?.alpha, state.photos);
    const formatTurn = angle(Math.abs(turn));
    let turnHint = '';
    if (slot.step === 'fan' && slot.number > 1 && turn !== null) turnHint = 'Στροφή από την πρώτη λήψη ' + formatTurn + ' · Ενδεικτική';
    if (slot.step === 'side') {
      turnHint = (turn === null ? '' : 'Στροφή από τη βεντάλια ' + formatTurn + ' · ') + 'Στόχος 90° ± 15° από όποια πλευρά';
    }
    byId('angle-turn').hidden = !turnHint;
    setText(byId('angle-turn'), turnHint);
    announcer.offer(instruction);
  }

  function renderStage() {
    const step = state.step;
    const slot = guide.currentSlot();
    const isLive = state.cameraMode === 'live';
    const opening = state.cameraMode === 'opening';
    const isFile = state.cameraMode === 'file';
    const count = step === 4 ? state.fanCount : 1;
    moveElement(station, byId('stage-' + step));
    station.hidden = false;
    mountPreview(byId('capture-preview-mount'), Boolean(slot) && (isLive || opening), step === 3);
    const taken = state.lastTaken;
    const n = shotsFor(state, step).length;
    if (taken && taken !== announcedShot) {
      announcedShot = taken;
      announcer.offer('Ελήφθη ' + taken.number + ' από ' + count + '.' +
        (state.captureMessage ? ' ' + state.captureMessage : ''), true);
    }
    const counter = state.retake ? 'Επανάληψη λήψης ' + slot.number + ' από ' + count
      : slot ? 'Λήψη ' + slot.number + ' από ' + count + (n === 0 ? '' : ' · Ελήφθησαν ' + n)
        : 'Ελήφθη ' + n + ' από ' + count;
    setText(byId('capture-counter'), counter);
    byId('capture-angle').hidden = !slot;
    setText(byId('angle-name'), step === 3 ? 'Αλφάδι · Τώρα' : 'Τώρα');
    if (slot) {
      const targetText = step === 3 ? '90° ± 5°'
        : step === 4 ? angle(slot.target.elevation) + ' ± 2°'
          : '0° έως 10°';
      setText(byId('angle-target'), targetText);
    }
    const shutter = byId('take-photo');
    const moveFocus = !slot && document.activeElement === shutter;
    shutter.hidden = !slot;
    shutter.disabled = !state.busy && !isLive && !isFile;
    busy(shutter, state.busy, isFile ? 'Τράβηξε με την κάμερα του κινητού' : 'Τράβηξε φωτογραφία', 'Βγάζω φωτογραφία…');
    byId('cancel-photo').hidden = !state.busy || !isFile;
    const reopen = byId('stage-open-camera');
    reopen.hidden = !slot || isLive || isFile;
    busy(reopen, opening, 'Άνοιξε την κάμερα', 'Περιμένω την κάμερα…');
    byId('stage-file-mode').hidden = !slot || isFile || isLive;
    byId('stage-retake').hidden = Boolean(slot) || step === 4;
    byId('cancel-retake').hidden = !state.retake;
    byId('cancel-retake').disabled = state.busy;
    byId('continue-stage').hidden = Boolean(slot);
    setText(byId('continue-stage'), step === 3 ? 'Συνέχισε στη βεντάλια'
      : step === 4 ? 'Συνέχισε στη λήψη από το πλάι' : 'Συνέχισε στον έλεγχο');
    if (moveFocus) byId('continue-stage').focus({ preventScroll: true });
    const warning = state.captureMessage || (slot ? state.cameraError : '');
    const error = byId('capture-error');
    setText(error, warning || (slot && isFile ? CAPTURE_TEXT.file : ''));
    if (warning && !taken) announcer.offer(warning, true);

    if (step === 4) {
      for (const option of byId('fan-count').querySelectorAll('input')) {
        option.checked = Number(option.value) === state.fanCount;
        option.disabled = Boolean(state.retake) || state.busy;
      }
      byId('auto-capture').checked = state.autoCapture;
      byId('auto-capture').disabled = isFile || state.busy;
    }
    drawGuidance();
  }

  function renderSections() {
    const changed = state.step !== activeStep;
    if (changed) {
      activeStep = state.step;
      announcedShot = null;
      announcer.clear();
      setText(live, '');
    }
    for (const [index, element] of sections.entries()) {
      const step = index + 1;
      const current = step === state.step;
      const completed = state.completed.has(step);
      const collapsed = !current && completed;
      element.hidden = !current && !completed;
      element.querySelector('.step-body').hidden = !current;
      const review = element.querySelector('.step-summary');
      review.hidden = !collapsed;
      if (collapsed) setText(review, sectionSummary(state, step));
      const edit = element.querySelector('.edit-step');
      edit.hidden = !collapsed;
      edit.disabled = state.busy || Boolean(state.retake);
      const marker = progress[index];
      marker.toggleAttribute('data-done', collapsed);
      if (current) marker.setAttribute('aria-current', 'step');
      else marker.removeAttribute('aria-current');
      marker.setAttribute('aria-label', STEP_TITLES[index] + (collapsed ? ', ολοκληρώθηκε' : ''));
    }

    if (state.step === 1) renderPrep();
    else if (state.step === 2) renderCamera();
    else if (PHOTO_STEPS[state.step]) renderStage();
    else preview.hidden = true;
    byId('clear-photos').hidden = state.photos.size === 0;
    if (changed && state.step !== 1) focusStep();
  }

  function focusStep() {
    const heading = byId('step' + state.step + '-title');
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start' });
  }

  function renderChecks() {
    for (const id of ['check-flat', 'check-upright']) byId(id).disabled = !guide.latestSample();
  }

  prep.addEventListener('submit', submitPrep);
  prep.addEventListener('input', () => { clearPrepError(); renderPrep(); });
  for (const [index, element] of sections.entries()) {
    const button = element.querySelector('.edit-step');
    button.setAttribute('aria-label', 'Άλλαξε το βήμα «' + STEP_TITLES[index] + '»');
    button.addEventListener('click', () => {
      if (guide.edit(index + 1) && index === 0) focusStep();
    });
  }
  const bind = (id, listener) => byId(id).addEventListener('click', listener);
  const open = () => {
    if (state.cameraMode !== 'opening') void guide.openCamera(state.cameraInfo?.selectedId);
  };
  bind('open-camera', open);
  bind('stage-open-camera', open);
  bind('file-mode', guide.useFileMode);
  bind('stage-file-mode', guide.useFileMode);
  bind('request-sensor', () => void guide.requestSensor());
  bind('skip-sensor', guide.skipSensor);
  bind('check-flat', () => guide.checkSensor('flat'));
  bind('check-upright', () => guide.checkSensor('upright'));
  for (const id of ['continue-camera', 'continue-stage', 'continue-review']) bind(id, guide.advance);
  bind('take-photo', () => void guide.takePhoto());
  bind('cancel-photo', guide.cancelPhoto);
  bind('stage-retake', () => {
    const shot = shotsFor(state, state.step)[0];
    if (shot) guide.retake(shot.id);
  });
  bind('cancel-retake', guide.cancelRetake);

  byId('auto-capture').addEventListener('change', event => guide.setAutoCapture(event.target.checked));
  byId('fan-count').addEventListener('change', event => {
    const choice = Number(event.target.value);
    const action = () => guide.setFanCount(choice);
    if (shotsFor(state, 4).length) {
      event.target.checked = false;
      byId('fan-count').querySelector('input[value="' + state.fanCount + '"]').checked = true;
      confirm({
        title: 'Άλλαξε τον αριθμό λήψεων',
        message: 'Οι νέες γωνίες αλλάζουν. Θα ξαναβγάλεις τη βεντάλια και τη λήψη από το πλάι.',
        label: 'Άλλαξε σε ' + choice + ' λήψεις', action,
      });
    } else {
      action();
    }
  });

  bind('clear-photos', () => confirm({
    title: 'Σβήσε τις φωτογραφίες',
    message: 'Θα σβήσουν όλες οι λήψεις και τα σημεία που έχεις βάλει πάνω τους.',
    label: 'Σβήσε όλες τις φωτογραφίες',
    action: () => { guide.clearPhotos(); focusStep(); },
  }));
  bind('cancel-action', () => dialog.close());
  bind('confirm-button', () => {
    const action = confirmAction;
    dialog.close();
    action?.();
  });
  dialog.addEventListener('close', () => {
    guide.pauseAutoCapture(false);
    confirmAction = null;
    if (dialogInvoker && !dialogInvoker.closest('[hidden]') && document.activeElement === document.body) {
      dialogInvoker.focus({ preventScroll: true });
    }
    dialogInvoker = null;
  });

  guide.subscribe((current, kind) => {
    if (kind === 'sample') {
      if (current.step === 2) renderChecks();
      if (PHOTO_STEPS[current.step]) drawGuidance();
    } else {
      renderSections();
      onState(current, kind);
    }
  });
  renderSections();
  onState(state, 'initial');
  byId('load-message').hidden = true;
  byId('prep-continue').disabled = false;
}

export function browserClock(host) {
  return {
    now: () => host.performance.now(),
    setTimeout: (callback, delay) => host.setTimeout(callback, delay),
    clearTimeout: id => host.clearTimeout(id),
  };
}
