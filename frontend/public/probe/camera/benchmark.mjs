import { describeError } from './browser.mjs';
import { cameraDevices, probeLive, withCamera } from './camera.mjs';
import { largestObservedFrame } from './profiles.mjs';
import { SAMPLE_MS, sampleVideoSharpness } from './sampling.mjs';

async function measureFrames(video, frame, signal) {
  let frames = 0;
  let sumMs = 0;
  let worstMs;
  let lastVariance;
  const method = await sampleVideoSharpness(video, frame, signal, SAMPLE_MS, (variance, elapsed) => {
    frames++;
    sumMs += elapsed;
    worstMs = Math.max(worstMs ?? 0, elapsed);
    lastVariance = variance;
  });
  return {
    windowMs: SAMPLE_MS, method, frames, fps: frames / (SAMPLE_MS / 1000),
    meanMs: frames ? sumMs / frames : undefined, worstMs, lastVariance,
  };
}

export async function probeSpeed(preview, signal, live, progress = () => {}) {
  let largest = largestObservedFrame(live?.attempts);
  const usedLive = Boolean(largest);
  if (!largest) {
    const sweep = await probeLive(preview, signal, progress);
    largest = largestObservedFrame(sweep.attempts);
    if (!largest) return { state: sweep.state, message: sweep.message };
  }

  const result = { request: largest.request, reference: largest.frame, usedLive };
  try {
    await withCamera(cameraDevices(), result.request, preview, signal, async (_track, startVideo) => {
      const { video, frame } = await startVideo();
      result.frame = frame;
      progress('Μέτρηση καμβά για τρία δευτερόλεπτα.');
      Object.assign(result, await measureFrames(video, frame, signal));
    });
  } catch (error) {
    signal.throwIfAborted();
    return { ...result, ...describeError(error, 'Ο καμβάς δεν ολοκλήρωσε τη μέτρηση. Μπορείς να ξαναδοκιμάσεις.') };
  }

  if (result.frames === 0) {
    return { ...result, state: 'empty', message: 'Η μέτρηση τελείωσε χωρίς ολοκληρωμένο καρέ.' };
  }
  if (result.frame.width !== result.reference.width || result.frame.height !== result.reference.height) {
    return { ...result, state: 'done', message: 'Η νέα ροή έδωσε διαφορετικές διαστάσεις.' };
  }
  return { ...result, state: 'done' };
}
