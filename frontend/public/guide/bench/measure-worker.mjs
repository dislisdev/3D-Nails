import { calculateMeasurement } from './measurement.mjs';

self.addEventListener('message', ({ data }) => {
  try {
    self.postMessage(calculateMeasurement(data.included, data.sameLensConfirmed, { guidedFan: data.guidedFan }));
  } catch {
    self.postMessage({ ok: false, code: 'CALCULATION_ERROR' });
  }
});
