export function laplacianVariance(rgba, width, height, scratch) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3) {
    return undefined;
  }
  const count = width * height;
  if (rgba.length !== count * 4) return undefined;
  const gray = scratch?.length === count ? scratch : new Uint8Array(count);

  for (let index = 0, pixel = 0; index < count; index++, pixel += 4) {
    gray[index] = Math.round((299 * rgba[pixel] + 587 * rgba[pixel + 1] + 114 * rgba[pixel + 2]) / 1000);
  }

  let sum = 0;
  let squares = 0;
  for (let row = 1; row < height - 1; row++) {
    for (let column = 1; column < width - 1; column++) {
      const index = row * width + column;
      const value = gray[index - 1] + gray[index + 1] +
        gray[index - width] + gray[index + width] - 4 * gray[index];
      sum += value;
      squares += value * value;
    }
  }

  const samples = (width - 2) * (height - 2);
  return Math.max(0, squares / samples - (sum / samples) ** 2);
}
