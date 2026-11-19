// Πειραματικό · πρόσβαση σε εικόνα στη μνήμη · WebApp 0.1.0.
import { MeasurementInputError } from '../core/catalog.mjs';
import { grayscale } from '../core/image.mjs';
import { imageIdentity } from '../core/identity.mjs';
import { acceptableSize, rasterType } from '../core/raster-format.mjs';
import { messages } from './model.mjs';

const MAX_FILE_BYTES = 32_000_000;
const fail = (code, text = messages[code]) => new MeasurementInputError(code, text);

export async function readFrame(source, width, height) {
  if (!acceptableSize(width, height)) throw fail('fileSize');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw fail('fileRead');
  context.drawImage(source, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const gray = grayscale(data, width, height);
  const info = await imageIdentity(data, width, height);
  return { canvas, gray, info };
}

export async function readFileImage(file) {
  if (file.size > MAX_FILE_BYTES) throw fail('fileSize');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = rasterType(bytes);
  if (type === 'too-large') throw fail('fileSize');
  if (!type) throw fail('fileType');
  const url = URL.createObjectURL(new Blob([file], { type }));
  try {
    const documentImage = new Image();
    documentImage.src = url;
    await documentImage.decode();
    return await readFrame(documentImage, documentImage.naturalWidth, documentImage.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const cameraErrors = {
  NotAllowedError: 'cameraPermission', PermissionDeniedError: 'cameraPermission', SecurityError: 'cameraPermission',
  NotFoundError: 'cameraMissing', DevicesNotFoundError: 'cameraMissing',
  NotReadableError: 'cameraBusy', TrackStartError: 'cameraBusy',
};

export function cameraErrorKey(error) {
  return error?.code === 'cameraUnavailable' ? error.code : cameraErrors[error?.name] ?? 'cameraStart';
}

export function requestCamera(mediaDevices) {
  if (typeof mediaDevices?.getUserMedia !== 'function') throw fail('cameraUnavailable');
  return mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
}

export function stopMedia(stream) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
