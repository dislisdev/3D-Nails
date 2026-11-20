import { describeError, imageSize, ProbeError, waitFor } from './browser.mjs';
import { cameraLabel, canChooseMain, identifyCameras, normalizedCameraLabel } from './camera-labels.mjs';
import { CAMERA_PROFILES } from './profiles.mjs';

export function cameraDevices() {
  if (!globalThis.isSecureContext) {
    throw new ProbeError('unavailable', 'Άνοιξε τη σελίδα με HTTPS για να ζητήσεις την κάμερα.');
  }
  const devices = navigator.mediaDevices;
  if (typeof devices?.getUserMedia !== 'function') {
    throw new ProbeError('unavailable', 'Ο browser δεν διαθέτει πρόσβαση στη ζωντανή κάμερα.');
  }
  return devices;
}

function stopStream(stream) {
  for (const track of stream.getTracks()) track.stop();
}

async function firstVideoFrame(video, signal) {
  let frameRequest;
  const useFrameCallback = typeof video.requestVideoFrameCallback === 'function';
  const events = ['loadeddata', 'playing', 'timeupdate'];
  let onMediaError;
  let onData;

  const frame = new Promise((resolve, reject) => {
    const fail = () => reject(new ProbeError('error', 'Ο browser δεν ξεκίνησε την προεπισκόπηση.'));
    const read = () => imageSize(video.videoWidth, video.videoHeight);
    const onFrame = () => {
      try {
        const size = read();
        if (size) resolve(size);
        else frameRequest = video.requestVideoFrameCallback(onFrame);
      } catch {
        fail();
      }
    };

    onMediaError = fail;
    onData = () => {
      try {
        const size = read();
        if (video.readyState >= 2 && size) resolve(size);
      } catch {
        fail();
      }
    };
    video.addEventListener('error', onMediaError);
    if (useFrameCallback) frameRequest = video.requestVideoFrameCallback(onFrame);
    else for (const event of events) video.addEventListener(event, onData);
    Promise.resolve(video.play()).then(() => {
      if (!useFrameCallback) onData();
    }, fail);
  });

  try {
    return await waitFor(frame, signal, {
      timeoutMs: 8000,
      timeoutMessage: 'Ο browser δεν έδωσε καρέ μέσα σε 8 δευτερόλεπτα. Ξαναδοκίμασε.',
    });
  } finally {
    if (frameRequest !== undefined) video.cancelVideoFrameCallback?.(frameRequest);
    video.removeEventListener('error', onMediaError);
    for (const event of events) video.removeEventListener(event, onData);
  }
}

export async function withCamera(devices, request, preview, signal, inspect, deviceId) {
  signal.throwIfAborted();
  const stream = await waitFor(devices.getUserMedia({
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
      width: { ideal: request.width },
      height: { ideal: request.height },
    },
  }), signal, {
    timeoutMs: 25000,
    timeoutMessage: 'Η κάμερα δεν απάντησε μέσα σε 25 δευτερόλεπτα. Κλείσε τυχόν μήνυμα άδειας και ξαναδοκίμασε.',
    dispose: stopStream,
  });

  let video;
  let released = false;
  function release() {
    if (released) return;
    released = true;
    try {
      stopStream(stream);
    } finally {
      if (video) {
        video.srcObject = null;
        video.remove();
        preview.hidden = true;
      }
    }
  }

  signal.addEventListener('abort', release, { once: true });
  try {
    signal.throwIfAborted();
    const [track] = stream.getVideoTracks();
    if (!track) throw new ProbeError('unavailable', 'Ο browser δεν έδωσε ροή βίντεο.');

    async function startVideo() {
      signal.throwIfAborted();
      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('aria-label', 'Ζωντανή εικόνα από την κάμερα');
      preview.append(video);
      preview.hidden = false;
      video.srcObject = stream;
      const frame = await firstVideoFrame(video, signal);
      return { video, frame };
    }

    return await inspect(track, startVideo);
  } finally {
    signal.removeEventListener('abort', release);
    release();
  }
}

function optional(call) {
  try {
    return call();
  } catch {
    return undefined;
  }
}

export function numericRange(range) {
  if (![range?.min, range?.max, range?.step].some(Number.isFinite)) return undefined;
  return {
    min: Number.isFinite(range.min) ? range.min : undefined,
    max: Number.isFinite(range.max) ? range.max : undefined,
    step: Number.isFinite(range.step) ? range.step : undefined,
  };
}

export function stringList(list) {
  return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : undefined;
}

function publicSettings(settings) {
  if (!settings) return undefined;
  const { width, height, frameRate, facingMode, zoom, focusMode, resizeMode } = settings;
  return { width, height, frameRate, facingMode, zoom, focusMode, resizeMode };
}

function readCapabilities(track) {
  const caps = track.getCapabilities?.();
  if (!caps) return undefined;
  return {
    width: numericRange(caps.width),
    height: numericRange(caps.height),
    zoom: numericRange(caps.zoom),
    focusMode: stringList(caps.focusMode),
    focusDistance: numericRange(caps.focusDistance),
  };
}

function cameraDetails(track, deviceId) {
  const settings = optional(() => track.getSettings?.());
  const reportedId = settings?.deviceId;
  const label = track.label === reportedId || track.label === settings?.groupId
    ? undefined : cameraLabel(track.label);
  return {
    label,
    settings: publicSettings(settings),
    capabilities: optional(() => readCapabilities(track)),
    deviceMatches: deviceId && typeof reportedId === 'string' && reportedId ? reportedId === deviceId : undefined,
  };
}

async function listVideoDevices(devices, signal) {
  try {
    if (typeof devices.enumerateDevices !== 'function') return undefined;
    const entries = await waitFor(devices.enumerateDevices(), signal, { timeoutMs: 4000 });
    return entries.filter((device) => device.kind === 'videoinput');
  } catch {
    signal.throwIfAborted();
    return undefined;
  }
}

export async function probeLive(preview, signal, progress = () => {}, onDevices) {
  const attempts = CAMERA_PROFILES.map((request) => ({ request }));
  let devices;
  try {
    devices = cameraDevices();
  } catch (error) {
    return { ...describeError(error, 'Η ζωντανή κάμερα δεν ήταν διαθέσιμη.'), attempts };
  }

  let lastFailure;
  let frames = 0;
  for (const [index, attempt] of attempts.entries()) {
    signal.throwIfAborted();
    progress(`Αίτημα ${index + 1} από ${attempts.length}.`);
    attempt.requested = true;
    let opened = false;
    try {
      await withCamera(devices, attempt.request, preview, signal, async (track, startVideo) => {
        opened = true;
        try {
          const { frame } = await startVideo();
          attempt.frame = frame;
          frames++;
        } finally {
          signal.throwIfAborted();
          const { label, settings, capabilities } = cameraDetails(track);
          Object.assign(attempt, { label, settings, capabilities });
          const entries = await listVideoDevices(devices, signal);
          attempt.cameraCount = entries?.length;
          if (entries) onDevices?.(entries);
        }
      });
      attempt.state = 'done';
    } catch (error) {
      signal.throwIfAborted();
      lastFailure = describeError(error, 'Το αίτημα κάμερας απέτυχε. Μπορείς να ξαναδοκιμάσεις.');
      Object.assign(attempt, lastFailure);
      if (lastFailure.state === 'denied' || (!opened && lastFailure.state === 'timeout')) break;
    }
  }
  if (frames === attempts.length) return { state: 'done', attempts };
  if (frames > 0) return { state: 'partial', message: 'Ορισμένα αιτήματα έμειναν χωρίς καρέ.', attempts };
  return { ...lastFailure, attempts };
}

export async function probeSelectedCamera(camera, preview, signal, measure) {
  const request = CAMERA_PROFILES[0];
  const result = { request, requestedLabel: camera?.label };
  if (!camera?.deviceId) {
    return { ...result, state: 'unavailable', message: 'Ο browser δεν έδωσε τρόπο να ανοίξει αυτή την κάμερα.' };
  }
  try {
    await withCamera(cameraDevices(), request, preview, signal, async (track, startVideo) => {
      let video;
      try {
        ({ video, frame: result.frame } = await startVideo());
      } finally {
        signal.throwIfAborted();
        Object.assign(result, cameraDetails(track, camera.deviceId));
      }
      if (result.deviceMatches === false) {
        throw new ProbeError('error', 'Ο browser ανέφερε άλλη συσκευή από αυτή που ζητήθηκε.');
      }
      if (result.deviceMatches === undefined && result.label && result.requestedLabel &&
          normalizedCameraLabel(result.label) !== normalizedCameraLabel(result.requestedLabel)) {
        throw new ProbeError('error', 'Ο browser έδωσε άλλη ετικέτα από αυτή που ζητήθηκε.');
      }
      if (measure) Object.assign(result, await measure(video, result.frame, track));
    }, camera.deviceId);
    return { ...result, state: 'done' };
  } catch (error) {
    signal.throwIfAborted();
    return { ...result, ...describeError(error, 'Η συγκεκριμένη κάμερα δεν άνοιξε. Μπορείς να ξαναδοκιμάσεις.') };
  }
}

export async function probeCameraList(preview, signal, progress) {
  let entries;
  const live = await probeLive(preview, signal, progress, (devices) => { entries = devices; });
  signal.throwIfAborted();
  if (!entries) return { live };

  const catalog = identifyCameras(entries);
  live.cameraLabels = catalog.cameras.map(({ label }) => label);
  if (catalog.main) {
    progress?.('Άνοιγμα του κύριου πίσω φακού.');
    live.main = await probeSelectedCamera(catalog.main, preview, signal);
  } else {
    live.main = catalog.cameras.some(canChooseMain)
      ? { state: 'choice', message: 'Διάλεξε τον κύριο πίσω φακό από τη λίστα.' }
      : { state: 'unavailable', message: 'Ο browser δεν έδωσε επιλογή για τον κύριο πίσω φακό.' };
  }
  return { live, catalog };
}
