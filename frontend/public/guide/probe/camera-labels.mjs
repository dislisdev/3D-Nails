const words = (text) => new RegExp(`(?:^| )(?:${text})(?= |$)`, 'u');
const FRONT = words('front|selfie|user|true ?depth|μπροστιν\\p{L}*|μπροστα|εμπροσθ\\p{L}*|προσθι\\p{L}*');
const REAR = words('back|rear|environment|πισω|οπισθ\\p{L}*');
const TRIPLE = words('triple|τριπλ\\p{L}*');
const DUAL = words('dual|double|διπλ\\p{L}*');
const ULTRA = words('ultra ?wide(?:angle)?|super ?wide(?:angle)?|υπερ ?ευρυγων\\p{L}*|υπερ ?ευρει\\p{L}*');
const TELE = words('tele ?photo|tele|τηλεφακ\\p{L}*|τηλεφωτο\\p{L}*');
const WIDE = words('wide(?:angle)?|main|primary|ευρυγων\\p{L}*|ευρει\\p{L}*|κυρι\\p{L}*|βασικ\\p{L}*');
const GENERIC_REAR = /^(?:(?:back|rear) camera|πισω καμερα|οπισθια καμερα)$/u;

export function cameraLabel(label) {
  if (typeof label !== 'string' || /(?:data|blob):/i.test(label)) return undefined;
  return label.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() || undefined;
}

export function normalizedCameraLabel(label) {
  return (label ?? '').toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function cameraType(label) {
  const text = normalizedCameraLabel(label);
  const rear = REAR.test(text);
  if (FRONT.test(text)) return 'excluded';
  if (DUAL.test(text)) return 'excluded';
  if (TRIPLE.test(text)) return rear ? 'triple' : 'excluded';
  if (ULTRA.test(text)) return rear ? 'ultra' : 'excluded';
  if (TELE.test(text)) return rear ? 'tele' : 'excluded';
  if (rear && WIDE.test(text)) return 'wide';
  return GENERIC_REAR.test(text) ? 'rear' : 'unknown';
}

// Hardware labels can include an owner's device name. Export only known classes.
export function summaryCameraLabel(label) {
  const text = normalizedCameraLabel(cameraLabel(label));
  if (!text) return null;
  const side = REAR.test(text) ? 'Πίσω ' : '';
  if (FRONT.test(text)) return 'Μπροστινή κάμερα';
  for (const [pattern, name] of [[TRIPLE, 'τριπλή'], [DUAL, 'διπλή'], [ULTRA, 'υπερευρυγώνια'], [TELE, 'τηλεφακός'], [WIDE, 'κύρια']]) {
    if (pattern.test(text)) return (side + (pattern === TELE ? name : name + ' κάμερα')).trim();
  }
  return side ? 'Πίσω κάμερα' : 'Κάμερα';
}

export function canChooseMain(camera) {
  return Boolean(camera.deviceId) && ['wide', 'rear', 'unknown'].includes(camera.type);
}

function uniqueCamera(cameras) {
  return cameras.length === 1 && cameras[0].deviceId ? cameras[0] : undefined;
}

export function identifyCameras(entries) {
  const cameras = entries.map(({ label, deviceId, groupId }) => {
    const text = label === deviceId || label === groupId ? undefined : cameraLabel(label);
    return {
      label: text,
      deviceId: typeof deviceId === 'string' && deviceId ? deviceId : undefined,
      type: cameraType(text),
    };
  });
  const wide = cameras.filter(({ type }) => type === 'wide');
  const triple = uniqueCamera(cameras.filter(({ type }) => type === 'triple'));
  let main = uniqueCamera(wide);
  if (!wide.length && triple && cameras.some(({ type }) => type === 'ultra') &&
      cameras.some(({ type }) => type === 'tele')) {
    // Σε αυτή τη λίστα η γενική «Πίσω κάμερα» είναι η μόνη πιθανή κύρια.
    const possible = cameras.filter(({ type }) => type === 'rear' || type === 'unknown');
    if (possible[0]?.type === 'rear') main = uniqueCamera(possible);
  }
  return { cameras, main, triple };
}
