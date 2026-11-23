// Πειραματικό · Οδηγός λήψης 0.1.1 · ροή του πακέτου G1.
import { parseDiameter } from './bench/views.mjs';
import { cameraFailure, createCaptureTrace } from './capture.mjs';
import { alphaDelta, createStabilityGate } from './sensors.mjs';
import { CAPTURE_RULES, fanTargets, FAN_COUNTS, inTarget, SIDE_TARGET, TOP_TARGET } from './targets.mjs';
import { CAPTURE_TEXT } from './texts.mjs';
import { fanCameraIssue, FAN_ISSUE_TEXT } from './fan-camera.mjs';

export const PHOTO_STEPS = Object.freeze({ 3: 'top', 4: 'fan', 5: 'side' });
const CHECK_TARGETS = Object.freeze({ flat: 90, upright: 0 });

export function bindPageLifecycle(guide, document, host) {
  const visibility = () => guide.setBackground(document.hidden);
  document.addEventListener('visibilitychange', visibility);
  host.addEventListener('pagehide', event => {
    guide.setBackground(true);
    if (!event.persisted) guide.release();
  });
  host.addEventListener('pageshow', visibility);
  visibility();
}

function plan(name, targets) {
  return Object.freeze(targets.map((target, index) => Object.freeze({
    id: name + '-' + (index + 1), step: name, number: index + 1, target: Object.freeze(target),
  })));
}

const singles = { 3: plan('top', [TOP_TARGET]), 5: plan('side', [SIDE_TARGET]) };
const fans = new Map(FAN_COUNTS.map(count => [count, plan('fan', fanTargets(count))]));
export const plannedShots = (step, fanCount) => (step === 4 ? fans.get(fanCount) : singles[step]) ?? [];

export function shotsFor(state, step) {
  return plannedShots(step, state.fanCount).map(slot => state.photos.get(slot.id)).filter(Boolean);
}

export function headingAgainstFan(sample, photos) {
  const first = photos.get('fan-1');
  if (sample?.headingFrame == null || first?.headingFrame !== sample.headingFrame) return null;
  return alphaDelta(sample.heading, first.heading);
}

export function shotOutsideGuide(shot, photos) {
  const turn = headingAgainstFan(shot, photos);
  return {
    elevation: Number.isFinite(shot.elevationAtPress) && !inTarget(shot.elevationAtPress, shot.target),
    turn: turn !== null && (shot.step === 'side'
      ? Math.abs(Math.abs(turn) - CAPTURE_RULES.sideTurnDeg) > CAPTURE_RULES.sideTurnToleranceDeg
      : shot.step === 'fan' && Math.abs(turn) > CAPTURE_RULES.frontTurnDeg),
  };
}

function measureCheck(expected) {
  return { expected, state: 'skipped', observed: null };
}

export function createGuide({ camera, sensors, clock, urls = URL }) {
  const state = {
    step: 1,
    completed: new Set(),
    subject: 'object',
    edge: null,
    knownDiameterMm: null,
    diameterText: '',
    cameraMode: 'idle',
    cameraInfo: null,
    cameraError: '',
    sensor: {
      status: 'idle',
      checks: { flat: measureCheck(90), upright: measureCheck(0) },
      rateSource: null,
    },
    fanCount: 8,
    autoCapture: true,
    photos: new Map(),
    retake: null,
    busy: false,
    lastTaken: null,
    captureMessage: '',
  };
  const observers = new Set();
  const gate = createStabilityGate(clock);
  let latest;
  let background = false;
  let interactionPaused = false;
  let trace;
  let captureAbort;
  let filePending = false;
  let openAbort;
  let sensorRequest = 0;
  let headingFrame = 0;
  let lastFrame;
  let stopSensor;
  let sensorTimer;
  let staleTimer;

  function emit(kind = 'state') {
    for (const observer of observers) observer(state, kind);
  }

  function latestSample() {
    return latest && clock.now() - latest.at < CAPTURE_RULES.sampleGapMs ? latest : null;
  }

  function currentSlot() {
    return plannedShots(state.step, state.fanCount).find(slot =>
      state.retake ? slot.id === state.retake.id : !state.photos.has(slot.id));
  }

  function clearReview() {
    state.completed.delete(6);
    state.completed.delete(7);
  }

  function revokeShot(shot) {
    urls.revokeObjectURL(shot.url);
    if (shot.thumbUrl) urls.revokeObjectURL(shot.thumbUrl);
  }

  function closeCamera() {
    openAbort?.abort();
    openAbort = null;
    camera.close();
    gate.reset();
    if (state.cameraMode !== 'file') state.cameraMode = 'idle';
  }

  function go(step) {
    state.step = step;
    state.captureMessage = '';
    state.lastTaken = null;
    gate.reset();
    if (step === 1 || step >= 6) closeCamera();
    emit('step');
  }

  function removeShots(from = 3) {
    for (let step = from; step <= 5; step++) {
      for (const slot of plannedShots(step, state.fanCount)) {
        const shot = state.photos.get(slot.id);
        if (!shot) continue;
        revokeShot(shot);
        state.photos.delete(slot.id);
      }
      state.completed.delete(step);
    }
    clearReview();
  }

  function prepare({ subject, edge, diameter, consent }) {
    if (state.step !== 1) return false;
    if (subject !== 'object' && subject !== 'nail') return false;
    if (subject === 'nail' && (!consent || !['straight', 'rounded', 'unknown'].includes(edge))) return false;
    const knownDiameterMm = subject === 'object' ? parseDiameter(diameter) : null;
    if (Number.isNaN(knownDiameterMm)) return false;
    if (state.subject !== subject && state.photos.size) removeShots();
    state.subject = subject;
    state.edge = subject === 'nail' ? edge : null;
    state.knownDiameterMm = knownDiameterMm;
    state.diameterText = subject === 'object' ? diameter.trim() : '';
    state.completed.add(1);
    go(2);
    return true;
  }

  async function openCamera(deviceId) {
    if (background || state.step < 2 || state.step > 5 || state.busy) return false;
    closeCamera();
    const controller = new AbortController();
    openAbort = controller;
    state.cameraMode = 'opening';
    state.cameraError = '';
    emit();
    try {
      const info = await camera.open({
        deviceId,
        signal: controller.signal,
        onInterrupted: () => {
          if (openAbort !== controller) return;
          abortPhoto();
          closeCamera();
          state.cameraError = 'Η ζωντανή εικόνα σταμάτησε. Άνοιξε ξανά την κάμερα ή χρησιμοποίησε την κάμερα του κινητού.';
          emit();
        },
      });
      if (openAbort !== controller) return false;
      state.cameraMode = 'live';
      state.cameraInfo = info;
    } catch (error) {
      if (openAbort !== controller) return false;
      closeCamera();
      state.cameraMode = 'error';
      state.cameraError = cameraFailure(error).message;
    }
    emit();
    return state.cameraMode === 'live';
  }

  function useFileMode() {
    if (state.step < 2 || state.step > 5 || state.busy) return;
    closeCamera();
    state.cameraMode = 'file';
    state.cameraError = '';
    state.captureMessage = '';
    emit();
  }

  function stopReadingSensors() {
    sensorRequest++;
    headingFrame++;
    lastFrame = undefined;
    stopSensor?.();
    stopSensor = null;
    clock.clearTimeout(sensorTimer);
    clock.clearTimeout(staleTimer);
    staleTimer = null;
    latest = null;
    gate.reset();
  }

  function expireSample() {
    staleTimer = null;
    const sample = latestSample();
    if (sample) {
      staleTimer = clock.setTimeout(expireSample, CAPTURE_RULES.sampleGapMs - (clock.now() - sample.at));
      return;
    }
    gate.reset();
    if (state.sensor.status === 'active') {
      state.sensor.status = 'no-data';
      emit();
    } else emit('sample');
  }

  function receiveSample(sample) {
    if (background || !Number.isFinite(sample.elevation)) return;
    const now = clock.now();
    const at = sample.at ?? now;
    if (!Number.isFinite(at) || now - at >= CAPTURE_RULES.sampleGapMs || at > now || (latest && at < latest.at)) return;
    if (sample.frame !== lastFrame) {
      headingFrame++;
      lastFrame = sample.frame;
      gate.reset();
    }
    latest = { ...sample, at, headingFrame };
    const changed = state.sensor.status !== 'active';
    state.sensor.status = 'active';
    state.sensor.rateSource = sample.rateSource ?? null;
    clock.clearTimeout(sensorTimer);
    if (staleTimer == null) staleTimer = clock.setTimeout(expireSample, CAPTURE_RULES.sampleGapMs);
    trace?.observe(latest);

    if (state.step === 4 && state.autoCapture && !state.busy && !interactionPaused && state.cameraMode === 'live' && camera.ready()) {
      const slot = currentSlot();
      const turn = headingAgainstFan(latest, state.photos);
      const drifted = slot?.number > 1 && turn !== null && Math.abs(turn) > CAPTURE_RULES.frontTurnDeg;
      if (slot && !drifted) {
        if (gate.observe(latest, slot.target)) void takePhoto(true);
      } else gate.reset();
    } else {
      gate.reset();
    }
    emit(changed ? 'state' : 'sample');
  }

  async function requestSensor() {
    if (state.step !== 2 || state.sensor.status === 'requesting') return false;
    stopReadingSensors();
    const request = sensorRequest;
    state.sensor.status = 'requesting';
    // requestPermission may require this click's user activation.
    let pending;
    try {
      pending = sensors.requestPermission();
    } catch {
      pending = 'denied';
    }
    emit();
    let answer;
    try {
      answer = await pending;
    } catch {
      answer = 'denied';
    }
    if (request !== sensorRequest) return false;
    state.sensor.status = answer === 'granted' ? 'waiting' : answer === 'denied' ? 'denied' : 'unavailable';
    if (answer === 'granted') {
      sensorTimer = clock.setTimeout(() => {
        state.sensor.status = 'no-data';
        emit();
      }, CAPTURE_RULES.sensorWaitMs);
      stopSensor = sensors.subscribe(receiveSample);
    }
    emit();
    return answer === 'granted';
  }

  function skipSensor() {
    stopReadingSensors();
    state.sensor.status = 'skipped';
    emit();
  }

  function checkSensor(position) {
    const sample = latestSample();
    if (state.step !== 2 || !sample || !Object.hasOwn(CHECK_TARGETS, position)) return false;
    state.sensor.checks[position] = { expected: CHECK_TARGETS[position], state: 'measured', observed: sample.elevation };
    emit();
    return true;
  }

  function setFanCount(count) {
    if (!FAN_COUNTS.includes(count) || state.step !== 4 || state.busy || state.retake || count === state.fanCount) return false;
    return restartFan(count);
  }

  function restartFan(count = state.fanCount) {
    if (!FAN_COUNTS.includes(count) || state.step !== 4 || state.busy) return false;
    removeShots(4);
    state.retake = null;
    state.fanCount = count;
    state.lastTaken = null;
    state.captureMessage = '';
    gate.reset();
    emit();
    return true;
  }

  function setAutoCapture(on) {
    state.autoCapture = Boolean(on);
    gate.reset();
    emit();
  }

  async function takePhoto(automatic = false) {
    const slot = currentSlot();
    if (background || !slot || state.busy || !['live', 'file'].includes(state.cameraMode)) return false;
    const fromFile = state.cameraMode === 'file';
    const controller = new AbortController();
    const { signal } = controller;
    const captureTrace = createCaptureTrace({ clock, readSample: fromFile ? () => null : latestSample });
    trace = fromFile ? null : captureTrace;
    captureAbort = controller;
    filePending = fromFile;
    state.busy = true;
    state.lastTaken = null;
    state.captureMessage = '';
    gate.reset();
    emit();

    try {
      let acquired;
      try {
        acquired = await (fromFile ? camera.pick({ signal }) : camera.capture({ signal }));
      } catch (error) {
        signal.throwIfAborted();
        if (!fromFile) {
          closeCamera();
          state.cameraMode = 'file';
        }
        state.captureMessage = fromFile
          ? 'Η κάμερα του κινητού δεν έδωσε φωτογραφία. Δοκίμασε άλλη λήψη.'
          : cameraFailure(error).message;
        return false;
      }
      signal.throwIfAborted();
      const movement = captureTrace.finish();
      trace = null;
      if (!acquired) {
        state.captureMessage = 'Η λήψη ακυρώθηκε. Πάτησε λήψη όταν είσαι έτοιμη.';
        return false;
      }
      let dimensions;
      try {
        dimensions = await camera.inspect(acquired.blob, { signal });
      } catch {
        signal.throwIfAborted();
      }
      signal.throwIfAborted();
      if (!dimensions || !(dimensions.width > 0 && dimensions.height > 0)) {
        state.captureMessage = 'Η σελίδα δεν άνοιξε τη φωτογραφία. Ξαναβγάλε τη λήψη ή δοκίμασε εικόνα JPEG.';
        return false;
      }
      const { thumbnail, sharpnessScore, width, height } = dimensions;
      const previous = state.photos.get(slot.id);
      const shot = {
        ...slot, ...movement, width, height, method: acquired.method, blob: acquired.blob,
        camera: fromFile ? null : acquired.camera ?? state.cameraInfo,
        focal35Mm: dimensions.focal35Mm ?? null,
        focalLengthMm: dimensions.focalLengthMm ?? null,
        preview: dimensions.preview,
        sharpnessScore: Number.isFinite(sharpnessScore) ? sharpnessScore : null,
      };
      if (slot.step === 'fan') {
        const others = shotsFor(state, 4).filter(other => other.id !== slot.id);
        const issue = acquired.trackIssue ?? fanCameraIssue([...others, shot]);
        if (issue) {
          state.captureMessage = FAN_ISSUE_TEXT[issue];
          return false;
        }
      }
      const url = urls.createObjectURL(acquired.blob);
      let thumbUrl = null;
      try {
        if (thumbnail instanceof Blob && thumbnail.size) thumbUrl = urls.createObjectURL(thumbnail);
      } catch {
        // The review offers an explicit open button without loading the original.
      }
      if (previous) revokeShot(previous);
      state.photos.set(slot.id, { ...shot, url, thumbUrl });
      clearReview();
      state.lastTaken = { number: slot.number, at: clock.now() };
      state.captureMessage = movement.moved ? CAPTURE_TEXT.moved : '';
      if (state.retake) {
        const { from } = state.retake;
        state.retake = null;
        if (from === 6) go(6);
      }
      return true;
    } catch (error) {
      if (!signal.aborted) state.captureMessage = 'Η σελίδα δεν κράτησε τη φωτογραφία. Ξαναβγάλε τη λήψη.';
      return false;
    } finally {
      if (captureAbort === controller) {
        if (automatic && state.captureMessage && !state.lastTaken) state.autoCapture = false;
        captureAbort = null;
        trace = null;
        filePending = false;
        state.busy = false;
        emit();
      }
    }
  }

  function abortPhoto() {
    if (!captureAbort) return;
    captureAbort.abort();
    captureAbort = null;
    trace = null;
    filePending = false;
    state.busy = false;
    gate.reset();
  }

  function cancelPhoto() {
    abortPhoto();
    state.captureMessage = 'Η λήψη ακυρώθηκε. Πάτησε λήψη όταν είσαι έτοιμη.';
    emit();
  }

  function advance() {
    const step = state.step;
    if (state.busy || step < 2 || step > 6 || state.retake) return false;
    if (step === 2) {
      if (!['live', 'file'].includes(state.cameraMode)) return false;
      if (state.sensor.status === 'idle' || state.sensor.status === 'requesting') skipSensor();
    }
    if (PHOTO_STEPS[step] && currentSlot()) return false;
    state.completed.add(step);
    go(step + 1);
    return true;
  }

  function edit(step) {
    if (!state.completed.has(step) || step === state.step || state.busy || state.retake) return false;
    go(step);
    return true;
  }

  function retake(id) {
    const step = Number(Object.keys(PHOTO_STEPS).find(key => PHOTO_STEPS[key] === state.photos.get(id)?.step));
    if (!step || (state.step !== 6 && state.step !== step) || state.busy || state.retake) return false;
    state.retake = { id, from: state.step };
    go(step);
    return true;
  }

  function cancelRetake() {
    if (!state.retake || state.busy) return false;
    const { from } = state.retake;
    state.retake = null;
    go(from);
    return true;
  }

  function clearPhotos() {
    if (captureAbort && state.cameraMode === 'live') closeCamera();
    abortPhoto();
    state.retake = null;
    removeShots();
    state.lastTaken = null;
    if (state.step >= 3) go(3);
    else emit();
  }

  function setBackground(hidden) {
    if (background === hidden) return;
    background = hidden;
    latest = null;
    gate.reset();
    if (hidden) headingFrame++;
    if (hidden && (state.cameraMode === 'live' || state.cameraMode === 'opening')) {
      if (!filePending) abortPhoto();
      closeCamera();
      state.cameraError = 'Η κάμερα έκλεισε όσο η σελίδα ήταν στο φόντο. Άνοιξέ την ξανά για να συνεχίσεις.';
    }
    emit();
  }

  function release() {
    stopReadingSensors();
    state.sensor.status = 'idle';
    closeCamera();
    clearPhotos();
  }

  return {
    state, prepare, openCamera, useFileMode, requestSensor, skipSensor, checkSensor, latestSample, currentSlot,
    setFanCount, restartFan, setAutoCapture, takePhoto, cancelPhoto, advance, edit, retake, cancelRetake,
    clearPhotos, setBackground, release,
    pauseAutoCapture(paused) {
      interactionPaused = paused;
      gate.reset();
    },
    resumeVideo: () => camera.resumeVideo?.(),
    subscribe(observer) {
      observers.add(observer);
      return () => observers.delete(observer);
    },
  };
}

export function captureGuidance(state, slot, sample) {
  if (state.busy) return 'Κράτα σταθερά όσο βγαίνει η φωτογραφία.';
  if (!slot) return '';
  if (state.cameraMode === 'file') return CAPTURE_TEXT.noAngle;
  if (state.cameraMode !== 'live') return '';
  if (!sample) return state.sensor.status === 'active' ? CAPTURE_TEXT.waitingAngle : CAPTURE_TEXT.noAngle;
  const turn = headingAgainstFan(sample, state.photos);
  if (slot.step === 'fan' && slot.number > 1 && turn !== null && Math.abs(turn) > CAPTURE_RULES.frontTurnDeg) {
    return state.subject === 'nail' ? CAPTURE_TEXT.fanTurn : 'Έστριψες στο πλάι. Γύρνα στην ευθεία της άκρης.';
  }
  if (slot.step === 'top' && sample.elevation < slot.target.min) return 'Στρέψε την κάμερα πιο κάτω.';
  if (sample.elevation < slot.target.min) return 'Πιο ψηλά.';
  if (sample.elevation > slot.target.max) return 'Πιο χαμηλά.';
  if (slot.step === 'top') return 'Η κάμερα κοιτά προς τα κάτω. Κράτα σταθερά.';
  if (slot.step === 'side' && turn !== null &&
      Math.abs(Math.abs(turn) - CAPTURE_RULES.sideTurnDeg) > CAPTURE_RULES.sideTurnToleranceDeg) {
    return CAPTURE_TEXT.sideTurn;
  }
  return inTarget(sample.elevation, slot.target) ? 'Κράτα σταθερά.' : CAPTURE_TEXT.noAngle;
}
