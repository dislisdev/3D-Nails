// Πειραματικό · Οδηγός λήψης 0.1.1 · μετρήσεις browser και σύνοψη πάγκου.
import { publicTrackSettings } from './capture.mjs';
import { headingAgainstFan, shotOutsideGuide, shotsFor } from './guide-model.mjs';
import { summaryCameraLabel } from './probe/camera-labels.mjs';
import { REVIEW_SAMPLING } from './sharpness-check.mjs';
import { CAPTURE_RULES } from './targets.mjs';

export const GUIDE_VERSION = '0.1.1';
export const SUMMARY_SCHEMA = 'guide-summary/' + GUIDE_VERSION;
const number = value => Number.isFinite(value) ? value : null;

export function fanQuality(state) {
  const photos = shotsFor(state, 4);
  const elevations = photos.map(shot => shot.elevationAtPress).filter(Number.isFinite);
  const turns = photos.filter(shot => shot.number > 1)
    .map(shot => headingAgainstFan(shot, state.photos)).filter(Number.isFinite).map(Math.abs);
  return {
    captures: photos.length,
    elevationsMeasured: elevations.length,
    turnsMeasured: turns.length,
    outsideElevationTarget: photos.filter(shot => shotOutsideGuide(shot, state.photos).elevation).length,
    outsideTurnTarget: turns.filter(turn => turn > CAPTURE_RULES.frontTurnDeg).length,
    moved: photos.filter(shot => shot.moved === true).length,
    minElevationDeg: elevations.length ? Math.min(...elevations) : null,
    maxElevationDeg: elevations.length ? Math.max(...elevations) : null,
    maxSideTurnDeg: turns.length ? Math.max(...turns) : null,
  };
}

function readCamera(info) {
  return {
    label: summaryCameraLabel(info?.label),
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
    maxRotationFromPressDeg: number(shot.rotationFromPressDeg),
    rollDeg: number(shot.roll),
    screenOrientationDeg: number(shot.screenAngle),
    turnFromFirstFanDeg: headingAgainstFan(shot, state.photos),
    movementSamplesCoverCapture: shot.sampleCoverage === true,
    moved: shot.moved === true ? true : shot.moved === false ? false : null,
    method: shot.method,
    elapsedMs: shot.elapsedMs,
    width: shot.width,
    height: shot.height,
    focal35Mm: number(shot.focal35Mm),
    focalLengthMm: number(shot.focalLengthMm),
    sharpnessScore: number(shot.sharpnessScore),
    camera: shot.camera ? readCamera(shot.camera) : null,
  };
}

function readBrowser(agent = '') {
  const platform = /iPhone|iPad|iPod/.test(agent) ? 'iOS' : /Android/.test(agent) ? 'Android'
    : /Macintosh/.test(agent) ? 'macOS' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : null;
  const browsers = [
    ['Edge', /(?:Edg|EdgiOS|EdgA)\/([\d]+(?:\.\d+){0,3})/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+(?:\.\d+){0,3})/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+(?:\.\d+){0,3})/],
    ['Safari', /Version\/(\d+(?:\.\d+){0,3}).*Safari\//],
  ];
  for (const [name, pattern] of browsers) {
    const match = pattern.exec(agent);
    if (match) return { name, version: match[1], platform };
  }
  return { name: null, version: null, platform };
}

export function buildGuideSummary({ state, benchText, userAgent }) {
  const { sensor } = state;
  return {
    schema: SUMMARY_SCHEMA,
    pageVersion: GUIDE_VERSION,
    provenance: 'Πειραματικό · Οδηγός λήψης 0.1.1 · εικόνα και ρυθμίσεις από τον browser, γωνίες από τον αισθητήρα της συσκευής.',
    subject: state.subject,
    edge: state.edge,
    knownDiameterMm: state.knownDiameterMm,
    browser: readBrowser(userAgent),
    camera: readCamera(state.cameraInfo),
    sensor: {
      status: sensor.status,
      flat: readSensorCheck(sensor.checks.flat),
      upright: readSensorCheck(sensor.checks.upright),
      rotationRateSource: sensor.rateSource,
      turnIndicative: true,
      turnSource: 'deviceorientation: horizontal rear optical axis, same reference interval',
      endpointsSource: 'page sampling at request and acquisition completion',
    },
    captureRules: CAPTURE_RULES,
    physicalLensVerified: false,
    reviewSampling: REVIEW_SAMPLING,
    fanQuality: fanQuality(state),
    captures: [3, 4, 5].flatMap(step => shotsFor(state, step)).map(shot => readCapture(shot, state)),
    bench: JSON.parse(benchText),
  };
}
