// Πειραματικό · νήμα περιγράμματος · WebApp 0.2.0.
import { createContourSession } from './core/seed-contour.mjs';

let session;
self.onmessage = ({ data }) => {
  if (data.gray) {
    session = createContourSession(data.gray, data.width, data.height);
    return;
  }
  const { id, seed, options } = data;
  try {
    self.postMessage({ id, result: session.at(seed, options) });
  } catch {
    self.postMessage({ id, result: { ok: false, reason: 'Η ακμή δεν υπολογίστηκε. Δοκίμασε ξανά ή διάλεξε μικρότερη εικόνα.' } });
  }
};
