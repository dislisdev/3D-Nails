import { decodeImage, describeError, imageSize, waitFor } from './browser.mjs';
import { cameraDevices, numericRange, stringList, withCamera } from './camera.mjs';
import { CAMERA_PROFILES, largestObservedFrame } from './profiles.mjs';

async function captureOperation(capture, method, signal, measure) {
  try {
    if (typeof capture[method] !== 'function') {
      return { state: 'unavailable', message: 'Ο browser δεν διαθέτει αυτή τη λειτουργία.' };
    }
    return await measure();
  } catch (error) {
    signal.throwIfAborted();
    return describeError(error, 'Η λειτουργία φωτογραφίας απέτυχε. Μπορείς να ξαναδοκιμάσεις.');
  }
}

async function readPhotoCapabilities(capture, signal) {
  const caps = await waitFor(capture.getPhotoCapabilities(), signal);
  return {
    state: 'done',
    imageWidth: numericRange(caps.imageWidth),
    imageHeight: numericRange(caps.imageHeight),
    fillLightMode: stringList(caps.fillLightMode),
    redEyeReduction: caps.redEyeReduction,
  };
}

async function takePhoto(capture, signal) {
  const start = performance.now();
  const blob = await waitFor(capture.takePhoto(), signal);
  const result = { state: 'done', elapsedMs: performance.now() - start, type: blob.type };
  try {
    Object.assign(result, await decodeImage(blob, signal));
    return result;
  } catch {
    signal.throwIfAborted();
    return { ...result, state: 'partial', message: 'Ο browser έδωσε αρχείο χωρίς αναγνώσιμες διαστάσεις.' };
  }
}

async function grabFrame(capture, signal) {
  const start = performance.now();
  const bitmap = await waitFor(capture.grabFrame(), signal, { dispose: (lateBitmap) => lateBitmap.close() });
  try {
    const size = imageSize(bitmap.width, bitmap.height);
    return size
      ? { state: 'done', elapsedMs: performance.now() - start, size }
      : { state: 'unavailable', message: 'Ο browser δεν έδωσε διαστάσεις καρέ.' };
  } finally {
    bitmap.close();
  }
}

export async function probePhoto(preview, signal, live) {
  if (typeof globalThis.ImageCapture !== 'function') {
    return { state: 'unavailable', message: 'Ο browser δεν διαθέτει ImageCapture.' };
  }

  const request = largestObservedFrame(live?.attempts)?.request ?? CAMERA_PROFILES[0];
  return withCamera(cameraDevices(), request, preview, signal, async (track, startVideo) => {
    const capture = new globalThis.ImageCapture(track);
    try {
      await startVideo();
    } catch {
      signal.throwIfAborted();
      // Το ImageCapture χρησιμοποιεί τη ροή απευθείας από το track.
    }

    const capabilities = await captureOperation(capture, 'getPhotoCapabilities', signal,
      () => readPhotoCapabilities(capture, signal));
    const take = await captureOperation(capture, 'takePhoto', signal, () => takePhoto(capture, signal));
    const grab = await captureOperation(capture, 'grabFrame', signal, () => grabFrame(capture, signal));
    const result = { request, capabilities, take, grab };

    const optionalSucceeded = [capabilities, grab].every(({ state }) => state === 'done' || state === 'unavailable');
    if (take.state === 'done' && optionalSucceeded) return { ...result, state: 'done' };
    if ([capabilities, take, grab].some(({ state }) => state === 'done' || state === 'partial')) {
      return { ...result, state: 'partial', message: 'Δες στη σύνοψη ποια στοιχεία έδωσε ο browser.' };
    }
    return { ...result, state: take.state, message: take.message };
  });
}
