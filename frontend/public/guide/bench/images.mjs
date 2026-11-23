import { orientedFrame, readPhotoMetadata } from './views.mjs';
import { waitFor } from '../probe/browser.mjs';

// Ο αποκωδικοποιητής παίρνει τα pixel του JPEG χωρίς τα τμήματα APP1.
// Έτσι το Canvas εφαρμόζει μία φορά τον προσανατολισμό που διαβάσαμε.
export function jpegWithoutApp1(file, bytes) {
  const parts = [];
  let keptFrom = 0;
  let cursor = 2;
  while (bytes[cursor] === 0xff) {
    const markerStart = cursor;
    while (bytes[cursor] === 0xff) cursor++;
    const marker = bytes[cursor++];
    if (marker === 0xda || marker === 0xd9 || marker === 0x00 || marker === undefined) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.length) break;
    const length = bytes[cursor] * 256 + bytes[cursor + 1];
    const end = cursor + length;
    if (length < 2 || end > bytes.length) break;
    if (marker === 0xe1) {
      parts.push(file.slice(keptFrom, markerStart));
      keptFrom = end;
    }
    cursor = end;
  }
  parts.push(file.slice(keptFrom));
  return new Blob(parts, { type: 'image/jpeg' });
}

async function loadImage(blob, signal = new AbortController().signal) {
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    await waitFor(new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    }), signal);
    return image;
  } catch (error) {
    image.removeAttribute?.('src');
    throw error;
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

export async function jpegFrame(file, signal = new AbortController().signal) {
  const signature = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  signal.throwIfAborted();
  if (signature[0] !== 0xff || signature[1] !== 0xd8) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const { rawWidth, rawHeight, orientation, focal35Mm, focalLengthMm } = readPhotoMetadata(bytes, { includeLens: true });
  if (!rawWidth || !rawHeight) throw new Error('Λείπουν οι διαστάσεις του αρχείου JPEG.');
  const { width, height, transform } = orientedFrame(rawWidth, rawHeight, orientation);
  return { width, height, focal35Mm, focalLengthMm,
    preview: { blob: jpegWithoutApp1(file, bytes), rawWidth, rawHeight, transform } };
}

export function nativeFrame(blob, width, height) {
  return { width, height, focal35Mm: null, focalLengthMm: null,
    preview: { blob, rawWidth: width, rawHeight: height, transform: orientedFrame(width, height).transform } };
}

export async function preparePhoto(file, id) {
  const photo = { id, width: null, height: null, focal35Mm: null, cornersPx: [], edgePx: [], history: [] };
  try {
    let frame = await jpegFrame(file);
    if (!frame) {
      const image = await loadImage(file);
      const { naturalWidth: width, naturalHeight: height } = image;
      image.removeAttribute?.('src');
      if (!width || !height) throw new Error('Λείπουν οι διαστάσεις της εικόνας.');
      frame = nativeFrame(file, width, height);
    }
    const { preview, ...metadata } = frame;
    return { photo: { ...photo, ...metadata }, preview };
  } catch {
    photo.decodeFailed = true;
  }
  return { photo, preview: null };
}

export async function decodePreview({ blob, rawWidth, rawHeight, transform }, signal) {
  const image = await loadImage(blob, signal);
  if (image.naturalWidth !== rawWidth || image.naturalHeight !== rawHeight) {
    image.removeAttribute?.('src');
    throw new Error('Οι διαστάσεις της εμφανιζόμενης εικόνας διαφέρουν από τις διαστάσεις του αρχείου.');
  }
  return { image, transform };
}
