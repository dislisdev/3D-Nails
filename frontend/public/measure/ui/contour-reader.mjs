// Πειραματικό · σύνδεση με την επιλογή περιγράμματος · WebApp 0.2.0.
import { createContourSession } from '../core/seed-contour.mjs';

export const waitForPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export function openContourReader({ gray, info }) {
  const width = info.width_px, height = info.height_px;
  let worker;
  let fallback;
  let pending;
  let sequence = 0;
  let disposed = false;
  function fallBack() {
    worker?.terminate();
    worker = null;
    fallback ??= createContourSession(gray, width, height);
    if (pending) {
      const { seed, options, resolve, reject } = pending;
      pending = null;
      Promise.resolve().then(() => fallback.at(seed, options)).then(resolve, reject);
    }
  }
  try {
    worker = new Worker(new URL('../contour-worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (pending?.id !== data.id) return;
      const { resolve } = pending;
      pending = null;
      resolve(data.result);
    };
    worker.onerror = event => {
      event.preventDefault();
      if (!disposed) fallBack();
    };
    worker.postMessage({ gray, width, height });
  } catch {
    fallBack();
  }
  return {
    async at(seed, options) {
      if (disposed || pending) throw new Error('Η επιλογή ακμής δεν είναι διαθέσιμη.');
      await waitForPaint();
      if (disposed || pending) throw new Error('Η επιλογή ακμής δεν είναι διαθέσιμη.');
      if (fallback) return fallback.at(seed, options);
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending = { id, seed, options, resolve, reject };
        try {
          worker.postMessage({ id, seed, options });
        } catch {
          fallBack();
        }
      });
    },
    close() {
      disposed = true;
      worker?.terminate();
      pending?.reject(new Error('Η επιλογή ακμής ακυρώθηκε.'));
      pending = null;
    },
  };
}
