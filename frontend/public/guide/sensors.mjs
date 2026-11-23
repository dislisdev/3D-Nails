// Πειραματικό · Οδηγός λήψης 0.1.1 · προέλευση γωνιών DeviceOrientation (W3C).
import { CAPTURE_RULES, inTarget } from './targets.mjs';

const radians = Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function cameraAngles({ alpha, beta, gamma }, screenAngle = 0) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  // R = Rz(α) Rx(β) Ry(γ). Its last row is world-up expressed in device axes.
  // The camera points along device −z. Its downward angle is asin(Rzz).
  // In the image plane, atan2(Rzx, Rzy) measures world-up from screen +y.
  const cosBeta = Math.cos(beta * radians);
  const sinGamma = Math.sin(gamma * radians);
  const cosGamma = Math.cos(gamma * radians);
  const x = -cosBeta * sinGamma;
  const y = Math.sin(beta * radians);
  const z = cosBeta * cosGamma;
  const elevation = Math.asin(clamp(z, -1, 1)) / radians;
  const hasHorizon = Math.abs(elevation) < 70;
  return {
    elevation,
    roll: hasHorizon ? alphaDelta(Math.atan2(x, y) / radians, screenAngle) : null,
    // Horizontal projection of the optical axis −Rz(α) Rx(β) Ry(γ) z.
    heading: hasHorizon && Number.isFinite(alpha)
      ? alphaDelta(alpha + Math.atan2(sinGamma, y * cosGamma) / radians, 0) : null,
  };
}

export function alphaDelta(alpha, reference) {
  if (!Number.isFinite(alpha) || !Number.isFinite(reference)) return null;
  return ((alpha - reference + 180) % 360 + 360) % 360 - 180;
}

function orientationQuaternion({ alpha, beta, gamma }) {
  if (![alpha, beta, gamma].every(Number.isFinite)) return null;
  const [a, b, g] = [alpha, beta, gamma].map(angle => angle * radians / 2);
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cg = Math.cos(g), sg = Math.sin(g);
  return [
    ca * cb * cg - sa * sb * sg,
    ca * sb * cg - sa * cb * sg,
    ca * cb * sg + sa * sb * cg,
    sa * cb * cg + ca * sb * sg,
  ];
}

export function orientationDifference(previous, current) {
  const a = orientationQuaternion(previous);
  const b = orientationQuaternion(current);
  if (!a || !b) return null;
  const dot = a.reduce((sum, component, index) => sum + component * b[index], 0);
  return 2 * Math.acos(clamp(Math.abs(dot), 0, 1)) / radians;
}

export function orientationRate(previous, current, elapsedMs) {
  if (!(elapsedMs > 0) || elapsedMs > CAPTURE_RULES.sampleGapMs) return null;
  const angle = orientationDifference(previous, current);
  return angle === null ? null : angle * 1000 / elapsedMs;
}

export function createStabilityGate(clock) {
  const window = [];
  let lastTarget = null;

  function reset() {
    window.length = 0;
    lastTarget = null;
  }

  function observe(sample, target) {
    const now = clock.now();
    const at = sample?.at ?? now;
    const elevation = sample?.elevation;
    const rate = sample?.rotationRate;
    if (at > now || now - at >= CAPTURE_RULES.sampleGapMs || !inTarget(elevation, target) ||
        !Number.isFinite(rate) || rate < 0 || rate >= CAPTURE_RULES.rotationRateDegPerSecond) {
      reset();
      return false;
    }

    const last = window.at(-1);
    if (target.elevation !== lastTarget || (last && (at < last.at || at - last.at > CAPTURE_RULES.sampleGapMs))) {
      reset();
    }
    lastTarget = target.elevation;
    if (window.at(-1)?.at === at) window.pop();
    window.push({ at, elevation });

    // Keep at most one sample at or before the beginning of the current window.
    while (window[1]?.at <= at - CAPTURE_RULES.holdMs) window.shift();
    let elevations = window.map(entry => entry.elevation);
    while (Math.max(...elevations) - Math.min(...elevations) >= CAPTURE_RULES.elevationVariationDeg) {
      window.shift();
      elevations = elevations.slice(1);
    }
    return at - window[0].at >= CAPTURE_RULES.holdMs;
  }

  return { observe, reset };
}

export function createBrowserSensors({ host, clock }) {
  const orientation = host.DeviceOrientationEvent;
  const motion = host.DeviceMotionEvent;

  function requestPermission() {
    if (host.isSecureContext === false || !orientation) return Promise.resolve('unavailable');
    if (typeof orientation.requestPermission !== 'function') return Promise.resolve('granted');
    // Initiate both calls synchronously in the click handler on browsers that require it.
    try {
      const permission = orientation.requestPermission();
      if (typeof motion?.requestPermission === 'function') {
        try {
          Promise.resolve(motion.requestPermission()).catch(() => {});
        } catch {
          // Orientation can still provide a rotation estimate by itself.
        }
      }
      return Promise.resolve(permission).then(
        answer => answer === 'granted' ? 'granted' : 'denied',
        () => 'denied',
      );
    } catch {
      return Promise.resolve('denied');
    }
  }

  function subscribe(listener) {
    let previous;
    let gyro;
    let peakRate = 0;
    function sampleTime(event) {
      const now = clock.now();
      let at = event.timeStamp;
      if (!host.performance || !Number.isFinite(at) || at <= 0) return now;
      if (at > 1e12) at -= host.performance.timeOrigin;
      return at <= now && now - at < CAPTURE_RULES.sampleGapMs ? at : null;
    }
    const onMotion = event => {
      const { rotationRate } = event;
      const at = sampleTime(event);
      if (at === null) return;
      const components = [rotationRate?.alpha, rotationRate?.beta, rotationRate?.gamma];
      gyro = components.every(Number.isFinite) ? { at, rate: Math.hypot(...components) } : null;
      if (gyro) peakRate = Math.max(peakRate, gyro.rate);
    };
    const onOrientation = event => {
      const screenAngle = host.screen?.orientation?.angle ?? host.orientation ?? null;
      const angles = cameraAngles(event, screenAngle);
      const at = sampleTime(event);
      if (!angles || at === null || (previous && at < previous.at)) return;
      const raw = { alpha: event.alpha, beta: event.beta, gamma: event.gamma };
      const frame = event.absolute === true ? 'absolute' : 'relative';
      const gyroIsFresh = gyro && Math.abs(at - gyro.at) < CAPTURE_RULES.sampleGapMs;
      const estimated = previous?.frame === frame ? orientationRate(previous.raw, raw, at - previous.at) : null;
      previous = { at, raw, frame };
      const gyroRate = gyroIsFresh ? Math.max(peakRate, gyro.rate) : null;
      const useGyro = gyroRate !== null && gyroRate >= (estimated ?? 0);
      const rotationRate = useGyro ? gyroRate : estimated;
      peakRate = 0;
      listener({
        ...angles,
        at,
        screenAngle,
        frame,
        deviceAngles: raw,
        rotationRate,
        rateSource: useGyro ? 'devicemotion' : estimated === null ? null : 'deviceorientation',
      });
    };
    host.addEventListener('devicemotion', onMotion);
    host.addEventListener('deviceorientation', onOrientation);
    return () => {
      host.removeEventListener('devicemotion', onMotion);
      host.removeEventListener('deviceorientation', onOrientation);
    };
  }

  return { requestPermission, subscribe };
}
