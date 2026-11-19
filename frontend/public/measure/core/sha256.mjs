// Πειραματικό · SHA-256 για περιβάλλον χωρίς Web Crypto · WebApp 0.2.0.
// Σταθερές και πράξεις του SHA-256 από το πρότυπο FIPS 180-4, §§4.1.2, 4.2.2 και 6.2.
const INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];
const CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
const rotate = (word, shift) => (word >>> shift) | (word << (32 - shift));

export function sha256Local(bytes) {
  const state = new Uint32Array(INITIAL);
  const words = new Uint32Array(64);
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const last = bytes.length - bytes.length % 64;
  const tail = new Uint8Array(bytes.length - last < 56 ? 64 : 128);
  tail.set(bytes.subarray(last));
  tail[bytes.length - last] = 0x80;
  const remainder = new DataView(tail.buffer);
  remainder.setUint32(tail.length - 8, Math.floor(bytes.length / 0x20000000));
  remainder.setUint32(tail.length - 4, bytes.length * 8);

  for (let start = 0; start < last + tail.length; start += 64) {
    const block = start < last ? input : remainder;
    const offset = start < last ? start : start - last;
    for (let i = 0; i < 16; i++) words[i] = block.getUint32(offset + i * 4);
    for (let i = 16; i < words.length; i++) {
      const a = words[i - 15], b = words[i - 2];
      const sigma0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const sigma1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      words[i] = words[i - 16] + sigma0 + words[i - 7] + sigma1;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < words.length; i++) {
      const sigma0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const sigma1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const choose = (e & f) ^ (~e & g);
      const first = h + sigma1 + choose + CONSTANTS[i] + words[i];
      const second = sigma0 + majority;
      h = g;
      g = f;
      f = e;
      e = (d + first) | 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) | 0;
    }
    const result = [a, b, c, d, e, f, g, h];
    result.forEach((word, index) => { state[index] += word; });
  }
  return Array.from(state, word => word.toString(16).padStart(8, '0')).join('');
}
