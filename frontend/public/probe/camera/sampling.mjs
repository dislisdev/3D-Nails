import { ProbeError, waitFor } from './browser.mjs';
import { laplacianVariance } from './sharpness.mjs';

export const SAMPLE_MS = 3000;

export async function sampleWindow(signal, subscribe, windowMs = SAMPLE_MS) {
  signal.throwIfAborted();
  const deadline = performance.now() + windowMs;
  let timer;
  let unsubscribe;
  try {
    const sample = new Promise((finish, fail) => {
      timer = setTimeout(finish, windowMs);
      unsubscribe = subscribe({ deadline, finish, fail });
    });
    await waitFor(sample, signal);
  } finally {
    clearTimeout(timer);
    unsubscribe?.();
  }
}

export async function sampleVideoSharpness(video, frame, signal, windowMs, observe) {
  const { width, height } = frame;
  const cropWidth = Math.floor(width / 2);
  const cropHeight = Math.floor(height / 2);
  if (cropWidth < 3 || cropHeight < 3) {
    throw new ProbeError('unavailable', 'Το κεντρικό τμήμα ήταν πολύ μικρό για τον δείκτη καθαρότητας.');
  }
  const left = Math.floor((width - cropWidth) / 2);
  const top = Math.floor((height - cropHeight) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new ProbeError('unavailable', 'Ο browser δεν έδωσε καμβά για μέτρηση.');
    const gray = new Uint8Array(cropWidth * cropHeight);
    const useVideoFrame = typeof video.requestVideoFrameCallback === 'function';
    const method = useVideoFrame ? 'requestVideoFrameCallback' : 'requestAnimationFrame + video.currentTime';
    let previousTime;

    await sampleWindow(signal, ({ deadline, finish, fail }) => {
      let running = true;
      let id;
      const schedule = () => useVideoFrame
        ? video.requestVideoFrameCallback(processFrame)
        : requestAnimationFrame(processFrame);

      function processFrame() {
        if (!running) return;
        try {
          const started = performance.now();
          if (started >= deadline) {
            finish();
            return;
          }
          const fresh = useVideoFrame || video.currentTime !== previousTime;
          if (video.readyState >= 2 && fresh) {
            previousTime = video.currentTime;
            if (video.videoWidth !== width || video.videoHeight !== height) {
              throw new ProbeError('error', 'Οι διαστάσεις της ροής άλλαξαν στη μέτρηση. Δοκίμασε ξανά.');
            }
            context.drawImage(video, 0, 0, width, height);
            const { data } = context.getImageData(left, top, cropWidth, cropHeight);
            const variance = laplacianVariance(data, cropWidth, cropHeight, gray);
            if (variance === undefined) {
              throw new ProbeError('unavailable', 'Ο καμβάς δεν έδωσε δεδομένα για τον δείκτη καθαρότητας.');
            }
            const finished = performance.now();
            if (finished <= deadline) observe(variance, finished - started);
          }
          if (performance.now() >= deadline) finish();
          else id = schedule();
        } catch (error) {
          fail(error);
        }
      }

      id = schedule();
      return () => {
        running = false;
        if (useVideoFrame) video.cancelVideoFrameCallback?.(id);
        else cancelAnimationFrame(id);
      };
    }, windowMs);
    return method;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function probeTilt(signal) {
  if (!globalThis.isSecureContext) {
    return { state: 'unavailable', message: 'Άνοιξε τη σελίδα με HTTPS για να ζητήσεις την κλίση.' };
  }

  const orientation = globalThis.DeviceOrientationEvent;
  if (!orientation && !('ondeviceorientation' in window)) {
    return { state: 'unavailable', message: 'Ο browser δεν διαθέτει αισθητήρες κλίσης για τη σελίδα.' };
  }
  const result = {};
  if (typeof orientation?.requestPermission === 'function') {
    result.permission = await waitFor(orientation.requestPermission(), signal, {
      timeoutMs: 25000,
      timeoutMessage: 'Η άδεια κλίσης δεν απαντήθηκε μέσα σε 25 δευτερόλεπτα.',
    });
    if (result.permission === 'denied') {
      return { ...result, state: 'denied', message: 'Έλεγξε την άδεια κλίσης στις ρυθμίσεις του browser.' };
    }
  }

  let events = 0;
  let beta;
  let gamma;
  await sampleWindow(signal, ({ deadline }) => {
    const onOrientation = (event) => {
      if (performance.now() >= deadline) return;
      events++;
      beta = Number.isFinite(event.beta) ? event.beta : undefined;
      gamma = Number.isFinite(event.gamma) ? event.gamma : undefined;
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  });
  Object.assign(result, { windowMs: SAMPLE_MS, events, hz: events / (SAMPLE_MS / 1000), beta, gamma });
  return events > 0
    ? { ...result, state: 'done' }
    : { ...result, state: 'empty', message: 'Δεν έφτασε κανένα γεγονός κλίσης.' };
}
