import { ProbeError, describeError } from './browser.mjs';
import { cameraDevices, probeLive, withCamera } from './camera.mjs';
import { largestObservedFrame } from './profiles.mjs';
import { SAMPLE_MS, sampleWindow } from './sampling.mjs';
import { laplacianVariance } from './sharpness.mjs';

async function measureFrames(video, frame, signal) {
  const { width, height } = frame;
  const cropWidth = Math.floor(width / 2);
  const cropHeight = Math.floor(height / 2);
  if (cropWidth < 3 || cropHeight < 3) {
    throw new ProbeError('unavailable', 'Το κεντρικό τμήμα ήταν πολύ μικρό για τον δείκτη καθαρότητας.');
  }
  const left = Math.floor((width - cropWidth) / 2);
  const top = Math.floor((height - cropHeight) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new ProbeError('unavailable', 'Ο browser δεν έδωσε καμβά για μέτρηση.');
    const gray = new Uint8Array(cropWidth * cropHeight);
    const useVideoFrame = typeof video.requestVideoFrameCallback === 'function';
    const method = useVideoFrame ? 'requestVideoFrameCallback' : 'requestAnimationFrame + video.currentTime';
    let previousTime;
    let frames = 0;
    let sumMs = 0;
    let worstMs;
    let lastVariance;

    await sampleWindow(signal, ({ deadline, finish, fail }) => {
      let running = true;
      let id;
      const schedule = () => useVideoFrame
        ? video.requestVideoFrameCallback(processFrame)
        : requestAnimationFrame(processFrame);

      function processFrame() {
        if (!running) return;
        try {
          const started = performance.now();
          if (started >= deadline) {
            finish();
            return;
          }

          const fresh = useVideoFrame || video.currentTime !== previousTime;
          if (video.readyState >= 2 && fresh) {
            previousTime = video.currentTime;
            if (video.videoWidth !== width || video.videoHeight !== height) {
              throw new ProbeError('error', 'Οι διαστάσεις της ροής άλλαξαν στη μέτρηση. Δοκίμασε ξανά.');
            }
            context.drawImage(video, 0, 0, width, height);
            const { data } = context.getImageData(left, top, cropWidth, cropHeight);
            const variance = laplacianVariance(data, cropWidth, cropHeight, gray);
            if (variance === undefined) {
              throw new ProbeError('unavailable', 'Ο καμβάς δεν έδωσε δεδομένα για τον δείκτη καθαρότητας.');
            }
            const finished = performance.now();
            if (finished <= deadline) {
              const elapsed = finished - started;
              frames++;
              sumMs += elapsed;
              worstMs = Math.max(worstMs ?? 0, elapsed);
              lastVariance = variance;
            }
          }
          if (performance.now() >= deadline) finish();
          else id = schedule();
        } catch (error) {
          fail(error);
        }
      }

      id = schedule();
      return () => {
        running = false;
        if (useVideoFrame) video.cancelVideoFrameCallback?.(id);
        else cancelAnimationFrame(id);
      };
    });

    return {
      windowMs: SAMPLE_MS, method, frames, fps: frames / (SAMPLE_MS / 1000),
      meanMs: frames ? sumMs / frames : undefined, worstMs, lastVariance,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
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
