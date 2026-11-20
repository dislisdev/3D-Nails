import { orientedFrame, readPhotoMetadata } from './views.mjs';

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

async function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function preparePhoto(file, id) {
  const photo = { id, width: null, height: null, focal35Mm: null, cornersPx: [], edgePx: [], history: [] };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { format, rawWidth, rawHeight, orientation, focal35Mm } = readPhotoMetadata(bytes);
    photo.focal35Mm = focal35Mm;
    if (rawWidth !== null && rawHeight !== null) {
      const { width, height, transform } = orientedFrame(rawWidth, rawHeight, orientation);
      Object.assign(photo, { width, height });
      return { photo, preview: { blob: jpegWithoutApp1(file, bytes), rawWidth, rawHeight, transform } };
    } else if (format !== 'jpeg') {
      const image = await loadImage(file);
      const { naturalWidth: width, naturalHeight: height } = image;
      if (width > 0 && height > 0) {
        Object.assign(photo, { width, height });
        const { transform } = orientedFrame(width, height);
        return { photo, preview: { blob: file, rawWidth: width, rawHeight: height, transform } };
      }
    }
  } catch {
    photo.decodeFailed = true;
  }
  return { photo, preview: null };
}

export async function decodePreview({ blob, rawWidth, rawHeight, transform }) {
  const image = await loadImage(blob);
  if (image.naturalWidth !== rawWidth || image.naturalHeight !== rawHeight) {
    throw new Error('Οι διαστάσεις της εμφανιζόμενης εικόνας διαφέρουν από τις διαστάσεις του αρχείου.');
  }
  return { image, transform };
}
