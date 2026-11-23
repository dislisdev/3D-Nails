// Πειραματικό · Οδηγός λήψης 0.1.0 · διακύμανση από τη σελίδα ελέγχου 0.1.2.
import { waitFor } from './probe/browser.mjs';
import { laplacianVariance } from './probe/sharpness.mjs';

export const REVIEW_SAMPLING = Object.freeze({ maxEdgePx: 320, softBelowVariance: 18 });
const THUMBNAIL_QUALITY = 0.84;

export function thumbnailSize({ width, height }) {
  const scale = Math.min(1, REVIEW_SAMPLING.maxEdgePx / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function sampleForReview(document, image, size, signal) {
  const canvas = document.createElement('canvas');
  const { width, height } = thumbnailSize(size);
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    let sharpnessScore = null;
    try {
      sharpnessScore = laplacianVariance(context.getImageData(0, 0, width, height).data, width, height) ?? null;
    } catch {
      // Some browsers can still encode the thumbnail when readback is unavailable.
    }
    const thumbnail = await waitFor(
      new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', THUMBNAIL_QUALITY)),
      signal,
      { timeoutMs: 2000 },
    );
    return { thumbnail, sharpnessScore };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function possiblySoft(score) {
  return Number.isFinite(score) && score < REVIEW_SAMPLING.softBelowVariance;
}
