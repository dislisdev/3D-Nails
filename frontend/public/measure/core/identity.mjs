import { sha256Local } from './sha256.mjs';

const encode = new TextEncoder();

async function sha256(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return sha256Local(bytes);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

export async function imageIdentity(rgba, width, height) {
  return { image_id: 'image-' + await digestInputs([width, height, await sha256(rgba)]), width_px: width, height_px: height };
}

export function digestInputs(values) {
  return sha256(encode.encode(JSON.stringify(values)));
}
