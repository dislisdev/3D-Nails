// Πειραματικό. NAILFORM LAB P02, tests/lib/contour_core.mjs, έκδοση 0.2.0
// Καθαρές συναρτήσεις της κύριας συνεδρίας για περίγραμμα και προσαρμογή κύκλου, χωρίς DOM και
// χωρίς αρχεία: τρέχουν ίδιες στο Node και σε browser. Είναι οι ίδιες με του
// tests/y3c_reference_pipeline.mjs, βγαλμένες εδώ για να τις χρησιμοποιεί και η δοκιμή υβριδίου.

export function component(gray, width, height, threshold, seedPoint, allowed = null) {
  const sx = Math.floor(seedPoint[0]), sy = Math.floor(seedPoint[1]);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;
  const ok = (k) => gray[k] < threshold && (!allowed || allowed[k]);
  if (!ok(sy * width + sx)) return null;
  const mask = new Uint8Array(width * height);
  const stack = [sy * width + sx];
  mask[sy * width + sx] = 1;
  let count = 0;
  while (stack.length) {
    const k = stack.pop();
    count++;
    const x = k % width, y = (k - x) / width;
    if (x + 1 < width && !mask[k + 1] && ok(k + 1)) { mask[k + 1] = 1; stack.push(k + 1); }
    if (x > 0 && !mask[k - 1] && ok(k - 1)) { mask[k - 1] = 1; stack.push(k - 1); }
    if (y + 1 < height && !mask[k + width] && ok(k + width)) { mask[k + width] = 1; stack.push(k + width); }
    if (y > 0 && !mask[k - width] && ok(k - width)) { mask[k - width] = 1; stack.push(k - width); }
  }
  return { mask, count };
}

// Σημεία ορίου με παρεμβολή στο κατώφλι ανάμεσα σε οριακό pixel και τον εξωτερικό του γείτονα.
// Αν δοθεί `allowed`, μετριέται και πόσα οριακά σημεία ακουμπούν στο τέλος της επιτρεπόμενης ζώνης.
export function boundaryPoints(gray, width, height, threshold, mask, allowed = null) {
  const pts = [];
  let onBandLimit = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x;
      if (!mask[k]) continue;
      for (const [dx, dy] of dirs) {
        const xx = x + dx, yy = y + dy;
        const inside = xx >= 0 && yy >= 0 && xx < width && yy < height;
        if (inside && mask[yy * width + xx]) continue;
        if (!inside) { onBandLimit++; continue; }
        const kk = yy * width + xx;
        if (allowed && !allowed[kk]) { onBandLimit++; continue; }
        const gIn = gray[k], gOut = gray[kk];
        const t = gOut > gIn ? Math.min(1, Math.max(0, (threshold - gIn) / (gOut - gIn))) : 0.5;
        pts.push([x + 0.5 + dx * t, y + 0.5 + dy * t]);
      }
    }
  }
  return { points: pts, onBandLimit };
}

export function centroid(points) {
  let sx = 0, sy = 0;
  for (const p of points) { sx += p[0]; sy += p[1]; }
  return [sx / points.length, sy / points.length];
}

export function orderAround(points, center) {
  return points
    .map((p) => ({ p, a: Math.atan2(p[1] - center[1], p[0] - center[0]) }))
    .sort((u, v) => u.a - v.a)
    .map((u) => u.p);
}

// Αλγεβρική προσαρμογή κύκλου (Kasa). Μόνο για τη διάμετρο του δίσκου αναφοράς.
export function fitCircle(points) {
  const c = centroid(points);
  let suu = 0, suv = 0, svv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of points) {
    const u = p[0] - c[0], v = p[1] - c[1];
    suu += u * u; suv += u * v; svv += v * v;
    suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  const bu = 0.5 * (suuu + suvv), bv = 0.5 * (svvv + svuu);
  const uc = (bu * svv - bv * suv) / det, vc = (bv * suu - bu * suv) / det;
  return { center: [c[0] + uc, c[1] + vc], radius: Math.sqrt(uc * uc + vc * vc + (suu + svv) / points.length) };
}

export function angleInArc(deg, midDeg, arcDeg, trimDeg) {
  const d = ((deg - midDeg + 540) % 360) - 180;
  return Math.abs(d) <= arcDeg / 2 - trimDeg;
}

// Διάβρωση και διαστολή δυαδικής μάσκας με 4 γείτονες, `steps` φορές.
export function erode(mask, width, height, steps) {
  let cur = mask;
  for (let s = 0; s < steps; s++) {
    const next = new Uint8Array(cur.length);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const k = y * width + x;
        if (cur[k] && cur[k - 1] && cur[k + 1] && cur[k - width] && cur[k + width]) next[k] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

export function dilate(mask, width, height, steps) {
  let cur = mask;
  for (let s = 0; s < steps; s++) {
    const next = new Uint8Array(cur);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const k = y * width + x;
        if (cur[k]) continue;
        if ((x > 0 && cur[k - 1]) || (x + 1 < width && cur[k + 1]) || (y > 0 && cur[k - width]) || (y + 1 < height && cur[k + width])) next[k] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

export function medianGray(gray, mask) {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let k = 0; k < gray.length; k++) if (mask[k]) { hist[Math.max(0, Math.min(255, Math.round(gray[k])))]++; n++; }
  if (!n) return null;
  let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc * 2 >= n) return v; }
  return 255;
}

// Υβρίδιο: μια χοντρή μάσκα (από έτοιμο μοντέλο) λέει ΠΟΙΟ είναι το αντικείμενο· εδώ βρίσκεται
// ΠΟΥ ακριβώς είναι η ακμή του, με κατώφλι στη μέση ανάμεσα στον τόνο του αντικειμένου και του
// φόντου γύρω του, μέσα σε ζώνη γύρω από τη μάσκα. Δουλεύει και για αντικείμενο φωτεινότερο από
// το φόντο. Επιστρέφει άρνηση όταν η ακμή δεν ξεχωρίζει.
export function refineFromMask(gray, width, height, coarseMask, seedPoint, { band = 14, core = 4 } = {}) {
  let area = 0;
  for (let k = 0; k < coarseMask.length; k++) area += coarseMask[k];
  if (area < 50) return { ok: false, reason: 'η μάσκα είναι άδεια ή πολύ μικρή' };
  const inner = erode(coarseMask, width, height, core);
  const near = dilate(coarseMask, width, height, core);
  const allowed = dilate(near, width, height, band - core);
  const ring = new Uint8Array(gray.length);
  for (let k = 0; k < ring.length; k++) ring[k] = allowed[k] && !near[k] ? 1 : 0;
  const gObj = medianGray(gray, inner), gBg = medianGray(gray, ring);
  if (gObj === null || gBg === null) return { ok: false, reason: 'δεν υπάρχουν αρκετά pixel για τόνο αντικειμένου ή φόντου' };
  const contrast = Math.abs(gObj - gBg);
  if (contrast < 25) return { ok: false, reason: 'μικρή αντίθεση αντικειμένου και φόντου', gObj, gBg };
  const bright = gObj > gBg;
  const threshold = (gObj + gBg) / 2;
  // Φέρνουμε το πρόβλημα στη μορφή «σκούρο αντικείμενο σε ανοιχτό φόντο».
  const g2 = new Float64Array(gray.length);
  for (let k = 0; k < gray.length; k++) g2[k] = bright ? 255 - gray[k] : gray[k];
  const t2 = bright ? 255 - threshold : threshold;
  let seed = seedPoint;
  const sk = Math.floor(seed[1]) * width + Math.floor(seed[0]);
  if (!(g2[sk] < t2) || !inner[sk]) {
    // Το άγγιγμα έπεσε σε pixel που δεν μοιάζει με το αντικείμενο: παίρνουμε το πρώτο pixel του πυρήνα που μοιάζει.
    let found = -1;
    for (let k = 0; k < inner.length; k++) if (inner[k] && g2[k] < t2) { found = k; break; }
    if (found < 0) return { ok: false, reason: 'ο πυρήνας της μάσκας δεν έχει τον τόνο του αντικειμένου', gObj, gBg };
    seed = [found % width + 0.5, Math.floor(found / width) + 0.5];
  }
  const comp = component(g2, width, height, t2, seed, allowed);
  if (!comp) return { ok: false, reason: 'δεν βρέθηκε περιοχή στο σημείο εκκίνησης', gObj, gBg };
  // Μόνο το έξω όριο: τρύπες μέσα στο αντικείμενο (ανταύγειες, ανάγλυφο) δεν δίνουν σημεία ακμής.
  const solid = fillHoles(comp.mask, width, height);
  const { points, onBandLimit } = boundaryPoints(g2, width, height, t2, solid.mask, allowed);
  const limitShare = onBandLimit / Math.max(1, onBandLimit + points.length);
  if (limitShare > 0.02) return { ok: false, reason: 'η περιοχή φτάνει στο τέλος της ζώνης: η ακμή δεν ξεχωρίζει από το φόντο', gObj, gBg, limitShare };
  return { ok: true, points, area: comp.count, holesFilled: solid.added, gObj, gBg, bright, threshold, coarseArea: area, limitShare };
}

// ---------------------------------------------------------------------------------------------
// Έκδοση 0.2.0 (2026-11-19): επιλογή αντικειμένου από ΕΝΑ άγγιγμα, χωρίς έτοιμο μοντέλο.
// Γνωστή τεχνική: «μέγιστα σταθερή περιοχή» (MSER). Από το σημείο του αγγίγματος η περιοχή μεγαλώνει
// όσο χαλαρώνει η ανοχή τόνου T. Όσο η περιοχή είναι το αντικείμενο, το εμβαδό της μένει σχεδόν ίδιο
// για πολλές τιμές του T (πλατό)· όταν «χυθεί» στο φόντο, πηδά. Κάθε πλατό είναι ένας υποψήφιος.
// Η περιοχή του πλατό γίνεται η χοντρή μάσκα για το refineFromMask, που βρίσκει την ακριβή ακμή.
// Δουλεύει για αντικείμενο πιο σκούρο ή πιο φωτεινό από το φόντο.

// Γεμίζει τις τρύπες μιας μάσκας (π.χ. ανταύγειες μέσα σε ένα κέρμα), ώστε να μένει μόνο το έξω όριο.
export function fillHoles(mask, width, height) {
  const outside = new Uint8Array(mask.length);
  const stack = [];
  const push = (k) => { if (!mask[k] && !outside[k]) { outside[k] = 1; stack.push(k); } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
  while (stack.length) {
    const k = stack.pop();
    const x = k % width, y = (k - x) / width;
    if (x + 1 < width) push(k + 1);
    if (x > 0) push(k - 1);
    if (y + 1 < height) push(k + width);
    if (y > 0) push(k - width);
  }
  const filled = new Uint8Array(mask.length);
  let added = 0;
  for (let k = 0; k < mask.length; k++) { filled[k] = outside[k] ? 0 : 1; if (filled[k] && !mask[k]) added++; }
  return { mask: filled, added };
}

// Οι σταθερές περιοχές γύρω από ένα σημείο. Επιστρέφει υποψήφιους, με πρώτο τον πιο σταθερό.
export function seedRegions(gray, width, height, seedPoint, { delta = 4, minArea = 300, maxAreaShare = 0.6, stableBelow = 0.02, minPlateau = 8 } = {}) {
  const n = width * height;
  const sx = Math.floor(seedPoint[0]), sy = Math.floor(seedPoint[1]);
  if (sx < 2 || sy < 2 || sx >= width - 2 || sy >= height - 2) return { ok: false, reason: 'το σημείο είναι έξω από την εικόνα ή πάνω στην άκρη της' };
  // Ελαφρά εξομάλυνση 3x3 μόνο για την επιλογή της περιοχής· η ακμή μετριέται μετά στην αρχική εικόνα.
  const sm = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= height) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= width) continue; s += gray[yy * width + xx]; c++; } }
      sm[y * width + x] = s / c;
    }
  }
  // Τόνος του αντικειμένου: διάμεσος σε μικρό δίσκο γύρω από το άγγιγμα.
  const near = [];
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { if (dx * dx + dy * dy > 36) continue; const xx = sx + dx, yy = sy + dy; if (xx >= 0 && yy >= 0 && xx < width && yy < height) near.push(sm[yy * width + xx]); }
  near.sort((a, b) => a - b);
  const tone = near[near.length >> 1];
  // Πλημμύρα «ελάχιστου μέγιστου»: κόστος κάθε pixel είναι η μικρότερη ανοχή με την οποία το φτάνεις από το άγγιγμα.
  const cost = new Uint8Array(n).fill(255), done = new Uint8Array(n);
  const buckets = Array.from({ length: 256 }, () => []);
  const diff = (k) => Math.min(255, Math.round(Math.abs(sm[k] - tone)));
  const seedK = sy * width + sx;
  buckets[diff(seedK)].push(seedK);
  const hist = new Uint32Array(256);
  let total = 0, borderCost = 256, reached = 255;
  const limit = Math.floor(maxAreaShare * n);
  outer: for (let level = 0; level < 256; level++) {
    const b = buckets[level];
    while (b.length) {
      const k = b.pop();
      if (done[k]) continue;
      done[k] = 1; cost[k] = level; hist[level]++; total++;
      const x = k % width, y = (k - x) / width;
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && level < borderCost) borderCost = level;
      if (total > limit) { reached = level; break outer; }
      if (x + 1 < width && !done[k + 1]) buckets[Math.max(level, diff(k + 1))].push(k + 1);
      if (x > 0 && !done[k - 1]) buckets[Math.max(level, diff(k - 1))].push(k - 1);
      if (y + 1 < height && !done[k + width]) buckets[Math.max(level, diff(k + width))].push(k + width);
      if (y > 0 && !done[k - width]) buckets[Math.max(level, diff(k - width))].push(k - width);
    }
  }
  const area = new Float64Array(256);
  let acc = 0;
  for (let t = 0; t < 256; t++) { acc += hist[t]; area[t] = acc; }
  const tMax = Math.min(borderCost - 1, reached - delta - 1, 250);
  const plateaus = [];
  let run = null;
  for (let t = delta + 1; t <= tMax; t++) {
    const stable = area[t] >= minArea && (area[t + delta] - area[t - delta]) / area[t] <= stableBelow;
    if (stable) { if (!run) run = { from: t, to: t }; else run.to = t; }
    if ((!stable || t === tMax) && run) { if (run.to - run.from + 1 >= minPlateau) plateaus.push(run); run = null; }
  }
  if (!plateaus.length) return { ok: false, reason: 'δεν ξεχωρίζει σταθερή περιοχή γύρω από το σημείο: το αντικείμενο δεν διαφέρει αρκετά από το φόντο, ή αγγίζει την άκρη της εικόνας', tone, borderCost };
  const candidates = plateaus.map((p) => { const t = (p.from + p.to) >> 1; return { tolerance: t, from: p.from, to: p.to, width: p.to - p.from + 1, area: area[t] }; })
    .sort((a, b) => b.width - a.width);
  const maskAt = (t) => { const m = new Uint8Array(n); for (let k = 0; k < n; k++) if (done[k] && cost[k] <= t) m[k] = 1; return m; };
  return { ok: true, tone, borderCost, candidates, maskAt };
}

// Από ένα άγγιγμα στην ακριβή ακμή. `pick` διαλέγει υποψήφιο (0 = ο πιο σταθερός).
export function refineFromSeed(gray, width, height, seedPoint, { pick = 0, band = 14, core = 4 } = {}) {
  const regions = seedRegions(gray, width, height, seedPoint);
  if (!regions.ok) return regions;
  const cand = regions.candidates[Math.min(pick, regions.candidates.length - 1)];
  const coarse = fillHoles(regions.maskAt(cand.tolerance), width, height).mask;
  const res = refineFromMask(gray, width, height, coarse, seedPoint, { band, core });
  return { ...res, candidate: cand, candidates: regions.candidates.map(({ tolerance, width: w, area }) => ({ tolerance, width: w, area })), tone: regions.tone };
}
