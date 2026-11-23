// Πειραματικό · Οδηγός λήψης 0.1.1 · πηγή το πακέτο G1.
export const CAPTURE_RULES = Object.freeze({
  holdMs: 500,
  elevationVariationDeg: 0.7,
  rotationRateDegPerSecond: 5,
  sampleGapMs: 250,
  sensorWaitMs: 3000,
  movedDeg: 2,
  frontTurnDeg: 10,
  sideTurnDeg: 90,
  sideTurnToleranceDeg: 15,
  announcementMs: 1500,
});

export const TOP_TARGET = Object.freeze({ elevation: 90, min: 85, max: 95 });
export const SIDE_TARGET = Object.freeze({ elevation: 5, min: 0, max: 10 });
export const FAN_COUNTS = Object.freeze([5, 8]);

export function fanTargets(count) {
  if (!FAN_COUNTS.includes(count)) throw new RangeError('Expected five or eight fan views');
  return Array.from({ length: count }, (_, index) => {
    const elevation = 10 + 30 * index / (count - 1);
    return { elevation, min: elevation - 2, max: elevation + 2 };
  });
}

export function inTarget(elevation, target) {
  return Number.isFinite(elevation) && elevation >= target.min && elevation <= target.max;
}
