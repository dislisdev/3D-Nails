// Πειραματικό · Οδηγός λήψης 0.1.0 · μετρήσεις browser και σύνοψη πάγκου.
import { publicTrackSettings } from './capture.mjs';
import { headingAgainstFan, shotsFor } from './guide-model.mjs';
import { cameraLabel } from './probe/camera-labels.mjs';
import { REVIEW_SAMPLING } from './sharpness-check.mjs';
import { CAPTURE_RULES } from './targets.mjs';

export const GUIDE_VERSION = '0.1.0';
export const SUMMARY_SCHEMA = 'guide-summary/' + GUIDE_VERSION;
const number = value => Number.isFinite(value) ? value : null;

export function fanQuality(state) {
  const photos = shotsFor(state, 4);
  const elevations = photos.map(shot => shot.elevationAtPress).filter(Number.isFinite);
  const turns = photos.filter(shot => shot.number > 1)
    .map(shot => headingAgainstFan(shot.alpha, state.photos)).filter(Number.isFinite).map(Math.abs);
  return {
    captures: photos.length,
    minElevationDeg: elevations.length ? Math.min(...elevations) : null,
    maxElevationDeg: elevations.length ? Math.max(...elevations) : null,
    maxSideTurnDeg: turns.length ? Math.max(...turns) : null,
  };
}

function readCamera(info) {
  return {
    label: cameraLabel(info?.label) ?? null,
    trackSettings: publicTrackSettings(info?.settings),
  };
}

function readSensorCheck(check) {
  return { state: check.state, expectedDeg: check.expected, observedDeg: number(check.observed) };
}

function readCapture(shot, state) {
  return {
    step: shot.step,
    number: shot.number,
    targetElevationDeg: shot.target.elevation,
    targetBandDeg: [shot.target.min, shot.target.max],
    elevationAtPressDeg: number(shot.elevationAtPress),
    elevationAtEndDeg: number(shot.elevationAtEnd),
    elevationRangeDeg: number(shot.elevationRange),
    rollDeg: number(shot.roll),
    turnFromFirstFanDeg: headingAgainstFan(shot.alpha, state.photos),
    moved: shot.moved === true ? true : shot.moved === false ? false : null,
    method: shot.method,
    elapsedMs: shot.elapsedMs,
    width: shot.width,
    height: shot.height,
    sharpnessScore: number(shot.sharpnessScore),
    camera: shot.camera ? readCamera(shot.camera) : null,
  };
}

export function buildGuideSummary({ state, benchText, userAgent }) {
  const { sensor } = state;
  return {
    schema: SUMMARY_SCHEMA,
    pageVersion: GUIDE_VERSION,
    provenance: 'Πειραματικό · Οδηγός λήψης 0.1.0 · εικόνα και ρυθμίσεις από τον browser, γωνίες από τον αισθητήρα της συσκευής.',
    subject: state.subject,
    edge: state.edge,
    knownDiameterMm: state.knownDiameterMm,
    browser: { userAgent: typeof userAgent === 'string' ? userAgent : null },
    camera: readCamera(state.cameraInfo),
    sensor: {
      status: sensor.status,
      flat: readSensorCheck(sensor.checks.flat),
      upright: readSensorCheck(sensor.checks.upright),
      rotationRateSource: sensor.rateSource,
      turnIndicative: true,
      turnSource: 'deviceorientation.alpha',
      endpointsSource: 'page sampling at request and acquisition completion',
    },
    captureRules: CAPTURE_RULES,
    reviewSampling: REVIEW_SAMPLING,
    fanQuality: fanQuality(state),
    captures: [3, 4, 5].flatMap(step => shotsFor(state, step)).map(shot => readCapture(shot, state)),
    bench: JSON.parse(benchText),
  };
}
