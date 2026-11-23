import { readJpegExif } from './exif.mjs';

export const PAGE_VERSION = '0.1.1';
export const CARD_MM = Object.freeze([85.60, 53.98]);
export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 10;
export const MIN_EDGE_POINTS = 8;

// Η διαγώνιος του κάδρου των 35 mm είναι 43,27 mm.
export function focal35ToPixels(focal35Mm, width, height) {
  if (![focal35Mm, width, height].every(value => Number.isFinite(value) && value > 0)) return null;
  const pixels = focal35Mm * Math.hypot(width, height) / 43.27;
  return Number.isFinite(pixels) && pixels > 0 ? pixels : null;
}

// Μετασχηματισμοί Canvas. Η αρχή είναι στην πάνω αριστερή παρυφή και τα κέντρα
// των pixel είναι σε μισές μονάδες. Τα x και y αυξάνονται δεξιά και κάτω.
export function orientedFrame(rawWidth, rawHeight, orientation = 1) {
  const transforms = {
    1: [1, 0, 0, 1, 0, 0],
    2: [-1, 0, 0, 1, rawWidth, 0],
    3: [-1, 0, 0, -1, rawWidth, rawHeight],
    4: [1, 0, 0, -1, 0, rawHeight],
    5: [0, 1, 1, 0, 0, 0],
    6: [0, 1, -1, 0, rawHeight, 0],
    7: [0, -1, -1, 0, rawHeight, rawWidth],
    8: [0, -1, 1, 0, 0, rawWidth],
  };
  const direction = Number.isInteger(orientation) && orientation >= 1 && orientation <= 8 ? orientation : 1;
  const swapsAxes = direction >= 5;
  return {
    width: swapsAxes ? rawHeight : rawWidth,
    height: swapsAxes ? rawWidth : rawHeight,
    transform: transforms[direction],
  };
}

export function readPhotoMetadata(bytes, { includeLens = false } = {}) {
  const { format, fields, storedSize } = readJpegExif(bytes);
  const focal = fields.FocalLengthIn35mmFilm;
  const orientation = fields.Orientation;
  return {
    format,
    rawWidth: storedSize?.width ?? null,
    rawHeight: storedSize?.height ?? null,
    orientation: Number.isInteger(orientation) && orientation >= 1 && orientation <= 8 ? orientation : 1,
    focal35Mm: Number.isFinite(focal) && focal > 0 ? focal : null,
    ...(includeLens ? { focalLengthMm: fields.FocalLength > 0 ? fields.FocalLength : null } : {}),
  };
}

export function parseDiameter(text) {
  const value = text.trim();
  if (value === '') return null;
  if (!/^(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+)$/.test(value)) return NaN;
  const diameter = Number(value.replace(',', '.'));
  return Number.isFinite(diameter) && diameter / 2 > 0 ? diameter : NaN;
}

function insideImage(point, width, height) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
    && point[0] >= 0 && point[0] <= width && point[1] >= 0 && point[1] <= height;
}

export function photoStatus(photo) {
  const { width, height, cornersPx, edgePx } = photo;
  if (photo.decodeFailed || ![width, height].every(value => Number.isFinite(value) && value > 0)) {
    return 'unreadable';
  }
  if (cornersPx.length !== 4 || !cornersPx.every(point => insideImage(point, width, height))) {
    return 'needs-corners';
  }
  if (edgePx.length < MIN_EDGE_POINTS || !edgePx.every(point => insideImage(point, width, height))) {
    return 'needs-edge';
  }
  return 'ready';
}

export function sameFrameSize(photos) {
  if (photos.length === 0) return true;
  const { width, height } = photos[0];
  return photos.every(photo => (photo.width === width && photo.height === height)
    || (photo.width === height && photo.height === width));
}

export function buildViews(photos) {
  return photos.filter(photo => photoStatus(photo) === 'ready').map(photo => {
    const { id, width, height, focal35Mm, cornersPx, edgePx } = photo;
    return {
      photoId: id, width, height,
      view: {
        cornersPx: cornersPx.map(point => [...point]),
        edgePx: edgePx.map(point => [...point]),
        focalPx: focal35ToPixels(focal35Mm, width, height),
        cx: width / 2,
        cy: height / 2,
      },
    };
  });
}
