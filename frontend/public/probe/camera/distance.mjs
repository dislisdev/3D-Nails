import { probeSelectedCamera } from './camera.mjs';
import { sampleVideoSharpness } from './sampling.mjs';

export const DISTANCES_CM = [30, 20, 15, 12, 10];
export const DISTANCE_CAMERAS = { main: 'Κύριος φακός', triple: 'Τριπλή κάμερα' };
export const DISTANCE_WINDOW_MS = 2000;
export const SAME_SCENE = 'Σύγκρινε την ευκρίνεια μόνο στην ίδια σκηνή, με την ίδια κάρτα και τον ίδιο φωτισμό.';

async function sampleDistance(video, frame, track, signal) {
  const variances = [];
  let zoomMin;
  let zoomMax;
  const method = await sampleVideoSharpness(video, frame, signal, DISTANCE_WINDOW_MS, (variance) => {
    variances.push(variance);
    try {
      const zoom = track.getSettings?.()?.zoom;
      if (Number.isFinite(zoom)) {
        zoomMin = Math.min(zoomMin ?? zoom, zoom);
        zoomMax = Math.max(zoomMax ?? zoom, zoom);
      }
    } catch {
      // Η μέτρηση καρέ συνεχίζεται όταν ο browser δεν δίνει zoom.
    }
  });
  const samples = variances.length;
  if (!samples) return { samples, method };
  variances.sort((left, right) => left - right);
  const middle = Math.floor(samples / 2);
  const median = samples % 2 ? variances[middle] : (variances[middle - 1] + variances[middle]) / 2;
  return { samples, method, median, maximum: variances.at(-1), zoomMin, zoomMax };
}

export async function probeDistance(camera, role, cm, preview, signal, progress) {
  const result = await probeSelectedCamera(camera, preview, signal, (video, frame, track) => {
    progress?.(`${DISTANCE_CAMERAS[role]} · ${cm} cm · Κράτα το κινητό σταθερό για δύο δευτερόλεπτα.`);
    return sampleDistance(video, frame, track, signal);
  });
  const { state, message, label, frame, deviceMatches, samples, method, median, maximum, zoomMin, zoomMax } = result;
  const reading = { role, cm, state, message, label, frame, deviceMatches, samples, method, median, maximum, zoomMin, zoomMax };
  if (state === 'done' && samples === 0) {
    return { ...reading, state: 'empty', message: 'Δεν ολοκληρώθηκε κανένα καρέ σε δύο δευτερόλεπτα.' };
  }
  return reading;
}
