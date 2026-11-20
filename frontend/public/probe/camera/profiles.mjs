export const CAMERA_PROFILES = [
  { width: 4032, height: 3024 },
  { width: 3840, height: 2160 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
];

export function largestObservedFrame(attempts = []) {
  let largest;
  let bestArea = 0;
  for (const attempt of attempts) {
    const area = attempt.frame?.width * attempt.frame?.height;
    if (area > bestArea) {
      largest = attempt;
      bestArea = area;
    }
  }
  return largest;
}
