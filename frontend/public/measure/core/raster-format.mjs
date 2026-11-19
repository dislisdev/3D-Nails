// Πειραματικό · αναγνώριση στατικών αρχείων εικόνας · WebApp 0.2.0.
import { MAX_PIXELS } from './image.mjs';

const tag = (bytes, at, text) => [...text].every((char, i) => bytes[at + i] === char.charCodeAt(0));
const MAX_CANVAS_SIDE = 16_384;

const validDimensions = (width, height) => Number.isInteger(width) && Number.isInteger(height)
  && width > 0 && height > 0 && width <= 100_000 && height <= 100_000;

export function fitRaster(width, height) {
  if (!validDimensions(width, height)) return null;
  const ratio = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)), MAX_CANVAS_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * ratio)), height: Math.max(1, Math.floor(height * ratio)), ratio };
}

export function rasterType(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && tag(bytes, 12, 'IHDR')) {
    if (!validDimensions(view.getUint32(16), view.getUint32(20))) return 'too-large';
    for (let at = 8; at + 12 <= bytes.length;) {
      if (tag(bytes, at + 4, 'acTL')) return null;
      at += view.getUint32(at) + 12;
    }
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    for (let at = 2; at + 3 < bytes.length && bytes[at] === 0xff;) {
      const marker = bytes[at + 1];
      if (marker === 0xff) {
        at++;
        continue;
      }
      if (marker === 0xda || marker === 0xd9) break;
      const length = view.getUint16(at + 2);
      if (length < 2 || at + 2 + length > bytes.length) break;
      if (sof.has(marker) && length >= 7) {
        if (!validDimensions(view.getUint16(at + 7), view.getUint16(at + 5))) return 'too-large';
        break;
      }
      at += 2 + length;
    }
    return 'image/jpeg';
  }
  if (bytes.length >= 16 && tag(bytes, 0, 'RIFF') && tag(bytes, 8, 'WEBP')) {
    if (tag(bytes, 12, 'VP8X') && bytes.length >= 30) {
      if (bytes[20] & 2) return null;
      const width = 1 + bytes[24] + 256 * bytes[25] + 65536 * bytes[26];
      const height = 1 + bytes[27] + 256 * bytes[28] + 65536 * bytes[29];
      if (!validDimensions(width, height)) return 'too-large';
    }
    return 'image/webp';
  }
  if (bytes.length >= 16 && tag(bytes, 4, 'ftyp')) {
    const end = Math.min(bytes.length, view.getUint32(0));
    const brands = [];
    for (let at = 8; at + 4 <= end; at += at === 8 ? 8 : 4) {
      brands.push(String.fromCharCode(...bytes.subarray(at, at + 4)));
    }
    if (brands.includes('avif') && !brands.includes('avis')) return 'image/avif';
    if (brands.some(brand => ['heic', 'heix', 'hevc', 'hevx', 'heis', 'heim', 'mif1'].includes(brand))) return 'image/heic';
  }
  return null;
}
