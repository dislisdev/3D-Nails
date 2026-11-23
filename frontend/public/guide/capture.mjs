// Πειραματικό · Οδηγός λήψης 0.1.0 · προέλευση ροής και εικόνας ο browser.
import { cameraLabel, normalizedCameraLabel } from './probe/camera-labels.mjs';
import { CAMERA_PROFILES } from './probe/profiles.mjs';
import { decodeImage, describeError, imageSize, ProbeError, waitFor } from './probe/browser.mjs';
import { sampleForReview } from './sharpness-check.mjs';
import { CAPTURE_RULES } from './targets.mjs';

const PHOTO_WAIT_MS = 12000;
const CAPABILITIES_WAIT_MS = 800;
const JPEG_QUALITY = 1;
const stopStream = stream => stream.getTracks().forEach(track => track.stop());
const TRACK_MODES = {
  facingMode: ['user', 'environment', 'left', 'right'],
  focusMode: ['none', 'manual', 'single-shot', 'continuous'],
  resizeMode: ['none', 'crop-and-scale'],
};

export function publicTrackSettings(settings) {
  const result = {};
  for (const key of ['width', 'height', 'frameRate', 'aspectRatio', 'zoom', 'focusDistance']) {
    if (Number.isFinite(settings?.[key])) result[key] = settings[key];
  }
  for (const [key, allowed] of Object.entries(TRACK_MODES)) {
    if (allowed.includes(settings?.[key])) result[key] = settings[key];
  }
  return result;
}

export function isCompositeCamera(label) {
  return /(?:^| )(?:triple|dual|double|quad|multi(?:ple)?|logical|τριπλ\p{L}*|διπλ\p{L}*|τετραπλ\p{L}*|πολλαπλ\p{L}*|συνθετ\p{L}*)(?: |$)/u
    .test(normalizedCameraLabel(label));
}

function isFrontCamera(label) {
  return /(?:^| )(?:front|selfie|facetime|true ?depth|μπροστιν\p{L}*|εμπροσθ\p{L}*)(?: |$)/u
    .test(normalizedCameraLabel(label));
}

function publicLabel(label, { deviceId, groupId } = {}) {
  return label === deviceId || label === groupId ? null : cameraLabel(label) ?? null;
}

export function cameraFailure(error) {
  const { state, message } = describeError(error, 'Η κάμερα δεν άνοιξε. Ξαναδοκίμασε ή διάλεξε λήψη από το κινητό.');
  return {
    state,
    message: state === 'denied'
      ? 'Η ζωντανή κάμερα δεν πήρε άδεια. Άνοιξε την άδεια στις ρυθμίσεις ή διάλεξε λήψη από το κινητό.'
      : message,
  };
}

async function firstFrame(video, signal) {
  let frameId;
  const events = ['loadeddata', 'playing', 'timeupdate'];
  let onData;
  let onError;
  const frame = new Promise((resolve, reject) => {
    onError = () => reject(new ProbeError('error', 'Η εικόνα της κάμερας δεν άνοιξε. Ξαναδοκίμασε.'));
    onData = () => {
      const size = imageSize(video.videoWidth, video.videoHeight);
      if (size && video.readyState >= 2) resolve(size);
    };
    video.addEventListener('error', onError);
    const watchFrame = typeof video.requestVideoFrameCallback === 'function';
    if (watchFrame) {
      const onFrame = () => {
        const size = imageSize(video.videoWidth, video.videoHeight);
        if (size) resolve(size);
        else frameId = video.requestVideoFrameCallback(onFrame);
      };
      frameId = video.requestVideoFrameCallback(onFrame);
    } else {
      for (const event of events) video.addEventListener(event, onData);
    }
    Promise.resolve(video.play()).then(() => {
      if (!watchFrame) onData();
    }, onError);
  });
  try {
    return await waitFor(frame, signal, {
      timeoutMs: 8000,
      timeoutMessage: 'Η κάμερα δεν έδωσε εικόνα. Ξαναδοκίμασε ή διάλεξε λήψη από το κινητό.',
    });
  } finally {
    if (frameId !== undefined) video.cancelVideoFrameCallback?.(frameId);
    video.removeEventListener('error', onError);
    for (const event of events) video.removeEventListener(event, onData);
  }
}

async function largestPhotoOptions(shutter, signal) {
  try {
    const ranges = await waitFor(shutter.getPhotoCapabilities(), signal, { timeoutMs: CAPABILITIES_WAIT_MS });
    const width = ranges.imageWidth?.max;
    const height = ranges.imageHeight?.max;
    if (imageSize(width, height)) return { imageWidth: width, imageHeight: height };
  } catch {
    // Some browsers expose only takePhoto(), which can choose its own still size.
  }
  return null;
}

function usableBlob(blob) {
  return blob instanceof Blob && blob.size > 0;
}

async function takeStill(shutter, options, signal) {
  const take = settings => waitFor(settings ? shutter.takePhoto(settings) : shutter.takePhoto(), signal, {
    timeoutMs: PHOTO_WAIT_MS,
  });
  if (options) {
    try {
      const blob = await take(options);
      if (usableBlob(blob)) return blob;
    } catch (error) {
      signal.throwIfAborted();
      if (error?.state === 'timeout') throw error;
    }
  }
  return take(null);
}

async function takeVideoFrame(video, document, signal) {
  const size = imageSize(video.videoWidth, video.videoHeight);
  if (!size || video.readyState < 2 || video.paused) throw new Error('No live frame');
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(video, 0, 0, size.width, size.height);
    return await waitFor(new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)), signal);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function createBrowserCamera({ host, document, video, fileInput, inspect = decodeImage }) {
  let session;

  function close() {
    if (!session) return;
    const { stream, track, ended } = session;
    session = null;
    track.removeEventListener('ended', ended);
    video.removeEventListener('error', ended);
    video.srcObject = null;
    stopStream(stream);
  }

  async function open({ deviceId, signal, onInterrupted = () => {} }) {
    signal.throwIfAborted();
    close();
    const media = host.navigator?.mediaDevices;
    if (host.isSecureContext === false) {
      throw new ProbeError('unavailable', 'Η ζωντανή κάμερα θέλει HTTPS ή localhost. Άνοιξε την ασφαλή διεύθυνση ή διάλεξε λήψη από το κινητό.');
    }
    if (typeof media?.getUserMedia !== 'function') {
      throw new ProbeError('unavailable', 'Ο browser δεν δίνει ζωντανή κάμερα. Διάλεξε λήψη από το κινητό.');
    }
    const { width, height } = CAMERA_PROFILES[0];
    const stream = await waitFor(media.getUserMedia({
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
        width: { ideal: width },
        height: { ideal: height },
      },
    }), signal, {
      timeoutMs: 25000,
      timeoutMessage: 'Η κάμερα ακόμη περιμένει άδεια. Έλεγξε το μήνυμα του browser ή διάλεξε λήψη από το κινητό.',
      dispose: stopStream,
    });
    const track = stream.getVideoTracks()[0];
    if (!track || signal.aborted) {
      stopStream(stream);
      signal.throwIfAborted();
      throw new ProbeError('unavailable', 'Ο browser δεν έδωσε εικόνα. Διάλεξε λήψη από το κινητό.');
    }
    const opened = { stream, track };
    session = opened;
    opened.ended = () => {
      if (session !== opened) return;
      close();
      onInterrupted();
    };
    track.addEventListener('ended', opened.ended);
    video.srcObject = stream;
    try {
      const preview = await firstFrame(video, signal);
      video.addEventListener('error', opened.ended);
      let settings;
      try {
        settings = track.getSettings?.();
      } catch {
        // A useful stream can still have no readable settings.
      }
      const label = publicLabel(track.label, settings);
      if (settings?.facingMode === 'user' || isFrontCamera(label)) {
        throw new ProbeError('unavailable', 'Ο browser άνοιξε την μπροστινή κάμερα. Χρησιμοποίησε την πίσω κάμερα του κινητού μέσω της εναλλακτικής λήψης.');
      }
      let devices = [];
      try {
        const entries = await waitFor(media.enumerateDevices(), signal, { timeoutMs: 1000 });
        devices = entries.filter(entry => entry.kind === 'videoinput' && entry.deviceId && !isFrontCamera(entry.label))
          .map(entry => ({ id: entry.deviceId, label: publicLabel(entry.label, entry) }));
      } catch {
        signal.throwIfAborted();
      }
      if (session !== opened) throw new ProbeError('error', 'Η κάμερα σταμάτησε. Άνοιξέ την ξανά.');
      try {
        if (typeof host.ImageCapture === 'function') opened.shutter = new host.ImageCapture(track);
      } catch {
        // Canvas uses this same video track if ImageCapture cannot start.
      }
      if (typeof opened.shutter?.getPhotoCapabilities === 'function') {
        opened.photoOptions = largestPhotoOptions(opened.shutter, signal);
      }
      return {
        preview,
        label,
        settings: publicTrackSettings(settings),
        devices,
        selectedId: settings?.deviceId ?? deviceId ?? devices.find(device => label && device.label === label)?.id ?? null,
      };
    } catch (error) {
      if (session === opened) close();
      throw error;
    }
  }

  async function capture({ signal }) {
    signal.throwIfAborted();
    const opened = session;
    if (!opened || opened.track.muted) {
      throw new ProbeError('error', 'Η ζωντανή εικόνα σταμάτησε. Άνοιξε ξανά την κάμερα ή χρησιμοποίησε την κάμερα του κινητού.');
    }
    if (typeof opened.shutter?.takePhoto === 'function') {
      try {
        const options = await opened.photoOptions;
        signal.throwIfAborted();
        const blob = await takeStill(opened.shutter, options, signal);
        if (usableBlob(blob)) return { blob, method: 'takePhoto' };
      } catch {
        signal.throwIfAborted();
      }
    }
    try {
      if (session !== opened || opened.track.muted) throw new Error('Camera unavailable');
      const blob = await takeVideoFrame(video, document, signal);
      if (usableBlob(blob)) return { blob, method: 'canvas' };
    } catch {
      signal.throwIfAborted();
    }
    throw new ProbeError('error', 'Η ζωντανή κάμερα δεν έδωσε φωτογραφία. Άνοιξέ την ξανά ή χρησιμοποίησε την κάμερα του κινητού.');
  }

  function pick({ signal }) {
    return new Promise((resolve, reject) => {
      function finish(settle, value) {
        fileInput.removeEventListener('change', onChange);
        fileInput.removeEventListener('cancel', onCancel);
        signal.removeEventListener('abort', onAbort);
        fileInput.value = '';
        settle(value);
      }
      function onCancel() { finish(resolve, null); }
      function onAbort() { finish(reject, signal.reason); }
      function onChange() {
        const file = fileInput.files?.[0];
        // Keep a Blob, leaving the File's device filename behind.
        finish(resolve, usableBlob(file) ? { blob: file.slice(0, file.size, file.type), method: 'file' } : null);
      }
      signal.throwIfAborted();
      fileInput.value = '';
      fileInput.addEventListener('change', onChange);
      fileInput.addEventListener('cancel', onCancel);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        fileInput.click();
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  return {
    open,
    close,
    capture,
    pick,
    async inspect(blob, { signal }) {
      const { size, sample } = await inspect(blob, signal, (image, decodedSize, activeSignal) =>
        sampleForReview(document, image, decodedSize, activeSignal));
      return sample ? { ...size, ...sample } : size;
    },
    resumeVideo() {
      if (session && video.paused) Promise.resolve(video.play()).catch(() => {});
    },
    ready() {
      return Boolean(session && !session.track.muted && session.track.readyState !== 'ended' &&
        video.readyState >= 2 && !video.paused);
    },
  };
}

export function createCaptureTrace({ clock, readSample }) {
  const began = clock.now();
  const start = readSample();
  let min = Infinity;
  let max = -Infinity;
  let seen = 0;
  let lastAt = -Infinity;

  function observe(sample) {
    if (!sample || !Number.isFinite(sample.elevation) || sample.at <= lastAt) return;
    min = Math.min(min, sample.elevation);
    max = Math.max(max, sample.elevation);
    lastAt = sample.at;
    seen++;
  }
  observe(start);

  function finish() {
    const end = readSample();
    observe(end);
    const elevationRange = seen >= 2 ? max - min : null;
    return {
      elevationAtPress: start?.elevation ?? null,
      elevationAtEnd: end?.elevation ?? null,
      elevationRange,
      roll: start?.roll ?? null,
      alpha: start?.alpha ?? null,
      moved: elevationRange === null ? null : elevationRange > CAPTURE_RULES.movedDeg,
      elapsedMs: Math.max(0, Math.round(clock.now() - began)),
    };
  }

  return { observe, finish };
}
