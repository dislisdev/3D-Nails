// Πειραματικό · πρόσβαση σε εικόνα στη μνήμη · WebApp 0.2.0.
import { MeasurementInputError } from '../core/catalog.mjs';
import { grayscale } from '../core/image.mjs';
import { imageIdentity } from '../core/identity.mjs';
import { fitRaster, rasterType } from '../core/raster-format.mjs';
import { messages } from './model.mjs';

const MAX_FILE_BYTES = 96_000_000;
const fail = (code, text = messages[code]) => new MeasurementInputError(code, text);

export async function readFrame(source, width, height) {
  const fitted = fitRaster(width, height);
  if (!fitted) throw fail('fileSize');
  const canvas = document.createElement('canvas');
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw fail('fileRead');
  context.imageSmoothingQuality = 'high';
  // Ίδιος λόγος και στους δύο άξονες, με λιγότερο από ένα pixel περικοπή δεξιά ή κάτω.
  context.drawImage(source, 0, 0, width * fitted.ratio, height * fitted.ratio);
  const { data } = context.getImageData(0, 0, fitted.width, fitted.height);
  const gray = grayscale(data, fitted.width, fitted.height);
  const info = await imageIdentity(data, fitted.width, fitted.height);
  return { canvas, gray, info, original: { width, height }, ratio: fitted.ratio };
}

export async function readFileImage(file) {
  if (file.size > MAX_FILE_BYTES) throw fail('fileSize');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = rasterType(bytes);
  if (type === 'too-large') throw fail('fileSize');
  if (!type) throw fail('fileType');
  const blob = file.slice(0, file.size, type);
  let bitmap;
  if (typeof createImageBitmap === 'function') {
    // Ο αποκωδικοποιητής εφαρμόζει τον προσανατολισμό EXIF πριν δώσει διαστάσεις.
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => null);
  }
  if (bitmap) {
    try {
      return await readFrame(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const documentImage = new Image();
    documentImage.src = url;
    try {
      await documentImage.decode();
    } catch {
      throw fail(['image/heic', 'image/avif'].includes(type) ? 'fileType' : 'fileRead');
    }
    return await readFrame(documentImage, documentImage.naturalWidth, documentImage.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const cameraErrors = {
  NotAllowedError: 'cameraPermission', PermissionDeniedError: 'cameraPermission', SecurityError: 'cameraPermission',
  NotFoundError: 'cameraMissing', DevicesNotFoundError: 'cameraMissing', OverconstrainedError: 'cameraMissing',
  NotReadableError: 'cameraBusy', TrackStartError: 'cameraBusy',
};

export function cameraErrorKey(error) {
  return error?.code === 'cameraUnavailable' ? error.code : cameraErrors[error?.name] ?? 'cameraStart';
}

export function requestCamera(mediaDevices) {
  if (typeof mediaDevices?.getUserMedia !== 'function') throw fail('cameraUnavailable');
  return mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 8192 }, height: { ideal: 8192 } },
  }).then(async stream => {
    try {
      const track = stream.getVideoTracks?.()[0];
      const capabilities = track?.getCapabilities?.();
      const settings = track?.getSettings?.();
      const width = capabilities?.width?.max, height = capabilities?.height?.max;
      if (width && height && (settings?.width !== width || settings?.height !== height)) {
        // Τα δύο μέγιστα μπορεί να ανήκουν σε διαφορετικές αναλογίες καρέ.
        await track.applyConstraints?.({ width: { ideal: width }, height: { ideal: height } });
      }
    } catch {
      // Το αρχικό stream παραμένει διαθέσιμο.
    }
    return stream;
  });
}

export function stopMedia(stream) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
