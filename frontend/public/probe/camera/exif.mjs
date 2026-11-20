const PRIMARY_FIELDS = new Map([
  [0x010f, ['Make', 2]],
  [0x0110, ['Model', 2]],
  [0x0112, ['Orientation', 3]],
]);

const PHOTO_FIELDS = new Map([
  [0x920a, ['FocalLength', 5]],
  [0xa405, ['FocalLengthIn35mmFilm', 3]],
  [0xa002, ['PixelXDimension', 3, 4]],
  [0xa003, ['PixelYDimension', 3, 4]],
]);

const TYPE_WIDTH = { 2: 1, 3: 2, 4: 4, 5: 8 };
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0];
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function readTiff(bytes) {
  const result = { format: 'jpeg', fields: {}, incomplete: false };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const has = (offset, length) => offset >= 0 && length <= view.byteLength - offset;
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  const big = bytes[0] === 0x4d && bytes[1] === 0x4d;
  const u16 = (offset) => view.getUint16(offset, little);
  const u32 = (offset) => view.getUint32(offset, little);

  if (!has(0, 8) || (!little && !big) || u16(2) !== 42) {
    result.incomplete = true;
    return result;
  }

  function readValue(entry, type, count) {
    const length = count * TYPE_WIDTH[type];
    const offset = length <= 4 ? entry + 8 : u32(entry + 8);
    if (count === 0 || !has(offset, length) || (length > 4 && offset < 8)) {
      result.incomplete = true;
      return undefined;
    }

    if (type === 2) {
      let value = '';
      for (let index = offset; index < offset + length && bytes[index] !== 0; index++) {
        value += String.fromCharCode(bytes[index]);
      }
      return value || undefined;
    }
    if (count !== 1) {
      result.incomplete = true;
      return undefined;
    }
    if (type === 3) return u16(offset);
    if (type === 4) return u32(offset);

    const denominator = u32(offset + 4);
    if (denominator !== 0) return u32(offset) / denominator;
    result.incomplete = true;
    return undefined;
  }

  function readDirectory(offset, tags, primary) {
    if (offset < 8 || !has(offset, 2) || !has(offset + 2, u16(offset) * 12)) {
      result.incomplete = true;
      return undefined;
    }
    let photoOffset;
    const end = offset + 2 + u16(offset) * 12;
    for (let entry = offset + 2; entry < end; entry += 12) {
      const tag = u16(entry);
      const type = u16(entry + 2);
      const count = u32(entry + 4);
      if (primary && tag === 0x8769) {
        if (type === 4) photoOffset = readValue(entry, type, count);
        else result.incomplete = true;
        continue;
      }

      const field = tags.get(tag);
      if (!field) continue;
      const [name, ...allowedTypes] = field;
      if (!allowedTypes.includes(type)) {
        result.incomplete = true;
        continue;
      }
      const value = readValue(entry, type, count);
      if (value !== undefined) result.fields[name] = value;
    }
    return photoOffset;
  }

  const photoOffset = readDirectory(u32(4), PRIMARY_FIELDS, true);
  if (photoOffset !== undefined) readDirectory(photoOffset, PHOTO_FIELDS, false);
  return result;
}

export function readJpegExif(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (!(bytes instanceof Uint8Array) || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { format: 'other', fields: {} };
  }

  const result = { format: 'jpeg', fields: {}, incomplete: false, hasEnd: false };
  let exif;
  let sawScan = false;
  let inScan = false;
  let cursor = 2;
  while (cursor < bytes.length) {
    // Στα δεδομένα σάρωσης τα FF00 και οι δείκτες επανεκκίνησης ανήκουν στη σάρωση.
    if (inScan) cursor = bytes.indexOf(0xff, cursor);
    if (bytes[cursor] !== 0xff) break;
    while (bytes[cursor] === 0xff) cursor++;
    const marker = bytes[cursor++];
    if (marker === 0xd9) {
      result.hasEnd = true;
      break;
    }
    if ((inScan && marker === 0x00) || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xda) sawScan = true;
    if (cursor + 2 > bytes.length || marker === 0x00 || marker === 0xd8) break;

    const length = (bytes[cursor] << 8) | bytes[cursor + 1];
    const end = cursor + length;
    if (length < 2 || end > bytes.length) break;
    const start = cursor + 2;
    if (
      !exif && !sawScan && marker === 0xe1 && end - start >= EXIF_HEADER.length &&
      EXIF_HEADER.every((value, index) => bytes[start + index] === value)
    ) {
      exif = readTiff(bytes.subarray(start + EXIF_HEADER.length, end));
    }
    if (!result.storedSize && SOF_MARKERS.has(marker) && length >= 8) {
      const height = (bytes[start + 1] << 8) | bytes[start + 2];
      const width = (bytes[start + 3] << 8) | bytes[start + 4];
      const components = bytes[start + 5];
      if (width > 0 && height > 0 && components > 0 && length === 8 + 3 * components) {
        result.storedSize = { width, height };
      }
    }
    inScan = marker === 0xda;
    cursor = end;
  }
  result.fields = exif?.fields ?? result.fields;
  result.incomplete = exif?.incomplete ?? (!sawScan && !result.hasEnd);
  return result;
}
