import { calculateMeasurement } from './measurement.mjs';

self.addEventListener('message', ({ data }) => {
  try {
    self.postMessage(calculateMeasurement(data.included, data.sameLensConfirmed));
  } catch {
    self.postMessage({ ok: false, code: 'CALCULATION_ERROR' });
  }
});
