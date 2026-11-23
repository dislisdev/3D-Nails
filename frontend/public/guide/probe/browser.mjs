import { readJpegExif } from './exif.mjs';

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1']);

export class ProbeError extends Error {
  constructor(state, message) {
    super(message);
    this.state = state;
  }
}

export function describeError(error, fallback) {
  if (error instanceof ProbeError) return { state: error.state, message: error.message };
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return { state: 'denied', message: 'Έλεγξε την άδεια στις ρυθμίσεις του browser.' };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { state: 'unavailable', message: 'Ο browser δεν βρήκε κάμερα.' };
    case 'NotReadableError':
    case 'TrackStartError':
      return { state: 'error', message: 'Η κάμερα δεν άνοιξε. Κλείσε άλλες εφαρμογές κάμερας και ξαναδοκίμασε.' };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return { state: 'error', message: 'Η κάμερα δεν δέχτηκε το αίτημα.' };
    case 'AbortError':
      return { state: 'canceled', message: 'Η δοκιμή διακόπηκε. Μπορείς να ξαναδοκιμάσεις.' };
    default:
      return { state: 'error', message: fallback };
  }
}

export function waitFor(promise, signal, {
  timeoutMs = 12000,
  timeoutMessage = 'Η αναμονή πήρε πολύ χρόνο. Μπορείς να ξαναδοκιμάσεις.',
  dispose,
} = {}) {
  return new Promise((resolve, reject) => {
    let pending = true;
    const timer = setTimeout(() => fail(new ProbeError('timeout', timeoutMessage)), timeoutMs);

    function finish(settle, value) {
      if (!pending) return;
      pending = false;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      settle(value);
    }
    const fail = (error) => finish(reject, error);
    const abort = () => fail(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();

    Promise.resolve(promise).then(
      (value) => {
        if (pending) {
          finish(resolve, value);
        } else {
          try {
            dispose?.(value);
          } catch {
            // Η καθυστερημένη τιμή δεν περνά στα αποτελέσματα.
          }
        }
      },
      fail,
    );
  });
}

export function imageSize(width, height) {
  return Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
    ? { width, height }
    : undefined;
}

export async function decodeImage(blob, signal, sampleDecoded, { useBitmap = true } = {}) {
  signal.throwIfAborted();
  async function report(image, size, decoder) {
    let sample;
    try {
      sample = await sampleDecoded?.(image, size, signal);
    } catch {
      signal.throwIfAborted();
    }
    return { size, decoder, sample };
  }
  if (useBitmap && typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await waitFor(globalThis.createImageBitmap(blob), signal, {
        dispose: (lateBitmap) => lateBitmap.close(),
      });
      try {
        const size = imageSize(bitmap.width, bitmap.height);
        if (size) return await report(bitmap, size, 'createImageBitmap');
      } finally {
        bitmap.close();
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ProbeError && error.state === 'timeout') throw error;
    }
  }

  const image = new Image();
  const url = URL.createObjectURL(blob);
  try {
    await waitFor(new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new ProbeError('unavailable', 'Ο browser δεν άνοιξε την εικόνα.'));
      image.src = url;
    }), signal);
    const size = imageSize(image.naturalWidth, image.naturalHeight);
    if (!size) throw new ProbeError('unavailable', 'Ο browser δεν έδωσε διαστάσεις εικόνας.');
    return await report(image, size, 'HTMLImageElement');
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}

function hasHeifHeader(bytes) {
  return bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp' &&
    HEIF_BRANDS.has(String.fromCharCode(...bytes.subarray(8, 12)));
}

export async function probeFile(file, signal) {
  const result = { state: 'done', type: file.type, bytes: file.size };
  const issues = [];
  try {
    Object.assign(result, await decodeImage(file, signal));
  } catch {
    signal.throwIfAborted();
  }

  let heif = false;
  try {
    const signature = new Uint8Array(await waitFor(file.slice(0, 12).arrayBuffer(), signal));
    const header = readJpegExif(signature);
    if (header.format === 'jpeg') {
      const { storedSize, hasEnd, ...exif } = readJpegExif(await waitFor(file.arrayBuffer(), signal));
      result.exif = exif;
      result.jpegHasEnd = hasEnd;
      if (storedSize) result.storedSize = storedSize;
    } else {
      result.exif = header;
      heif = hasHeifHeader(signature);
    }
    if (result.exif.incomplete) issues.push('Κάποια πεδία EXIF μπορεί να είναι ελλιπή.');
  } catch {
    signal.throwIfAborted();
    issues.push('Το αρχείο δεν ήταν αναγνώσιμο για έλεγχο EXIF.');
  }
  if (!result.size) {
    if (!result.storedSize && !heif) {
      return { ...result, state: 'error', message: 'Το αρχείο δεν διαβάστηκε ως εικόνα.' };
    }
    issues.unshift(heif
      ? 'Ο browser δεν έδωσε αποκωδικοποιημένες διαστάσεις. Δοκίμασε ένα JPEG.'
      : 'Ο browser δεν έδωσε αποκωδικοποιημένες διαστάσεις.');
  }
  return issues.length
    ? { ...result, state: 'partial', message: issues.join(' ') }
    : result;
}

export function readEnvironment() {
  return {
    userAgent: navigator.userAgent,
    screen: imageSize(window.screen?.width, window.screen?.height),
    pixelRatio: window.devicePixelRatio,
  };
}
