import { waitFor } from './browser.mjs';

export const SAMPLE_MS = 3000;

export async function sampleWindow(signal, subscribe) {
  signal.throwIfAborted();
  const deadline = performance.now() + SAMPLE_MS;
  let timer;
  let unsubscribe;
  try {
    const sample = new Promise((finish, fail) => {
      timer = setTimeout(finish, SAMPLE_MS);
      unsubscribe = subscribe({ deadline, finish, fail });
    });
    await waitFor(sample, signal);
  } finally {
    clearTimeout(timer);
    unsubscribe?.();
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
