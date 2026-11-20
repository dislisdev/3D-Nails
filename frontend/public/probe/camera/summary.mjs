const PROBE_VERSION = '0.1.1';

const MISSING = 'δεν δίνεται';
const NOT_REQUESTED = 'δεν ζητήθηκε';
const STATES = {
  done: 'έγινε',
  partial: 'έγινε εν μέρει',
  denied: 'άρνηση άδειας',
  unavailable: MISSING,
  empty: MISSING,
  canceled: 'ακυρώθηκε',
  error: 'απέτυχε',
  timeout: 'έληξε ο χρόνος αναμονής',
};

const decimal = (maximumFractionDigits) => new Intl.NumberFormat('el', {
  maximumFractionDigits,
  useGrouping: false,
});
const standardNumber = decimal(20);
const oneDecimal = decimal(1);
const twoDecimals = decimal(2);
const threeDecimals = decimal(3);
const localDateTime = new Intl.DateTimeFormat('el-GR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function value(input, unit = '', number = standardNumber) {
  if (Number.isFinite(input)) return number.format(input) + unit;
  if (typeof input === 'string') {
    const text = input.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
    if (text) return text;
  }
  return MISSING;
}

function modes(list) {
  if (!Array.isArray(list)) return MISSING;
  const available = list.map((mode) => value(mode)).filter((mode) => mode !== MISSING);
  return available.length ? available.join(', ') : MISSING;
}

function dimensions(size, unit = ' px') {
  if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height)) return MISSING;
  return `${value(size.width)} × ${value(size.height, unit)}`;
}

function decodedDimensions(result) {
  return dimensions(result.size, result.decoder === 'HTMLImageElement' ? ' CSS px' : ' px');
}

function processingRate(result) {
  const unit = result.method === 'requestVideoFrameCallback' ? ' καρέ/δευτ.' : ' επεξεργασίες/δευτ.';
  return value(result.fps, unit, oneDecimal);
}

function range(limits) {
  if (!limits) return MISSING;
  const bounds = `ελάχιστο ${value(limits.min)}, μέγιστο ${value(limits.max)}`;
  return Number.isFinite(limits.step) ? `${bounds}, βήμα ${value(limits.step)}` : bounds;
}

export function formatStatus(result) {
  if (!result?.state) return NOT_REQUESTED;
  const status = STATES[result.state] ?? MISSING;
  return result.message ? `${status} · ${value(result.message)}` : status;
}

function appendCamera(lines, result) {
  for (const attempt of result?.attempts ?? []) {
    const profile = dimensions(attempt.request);
    if (!attempt.requested) {
      lines.push(`  Προφίλ ${profile} (ideal) · ${NOT_REQUESTED}`);
      continue;
    }
    const settings = attempt.settings;
    const capabilities = attempt.capabilities;
    const reportedSettings = [
      `πλάτος ${value(settings?.width, ' px')}`,
      `ύψος ${value(settings?.height, ' px')}`,
      `frameRate ${value(settings?.frameRate, ' καρέ/δευτ.', oneDecimal)}`,
      `facingMode ${value(settings?.facingMode)}`,
      `zoom ${value(settings?.zoom)}`,
      `focusMode ${value(settings?.focusMode)}`,
      `resizeMode ${value(settings?.resizeMode)}`,
    ];
    const reportedCapabilities = [
      `πλάτος ${range(capabilities?.width)}`,
      `ύψος ${range(capabilities?.height)}`,
      `zoom ${range(capabilities?.zoom)}`,
      `focusMode ${modes(capabilities?.focusMode)}`,
      `focusDistance ${range(capabilities?.focusDistance)}`,
    ];
    lines.push(
      `  Αίτημα ${profile} (ideal) · πίσω κάμερα (ideal), χωρίς ήχο · ${formatStatus(attempt)}`,
      `    Πρώτο καρέ (videoWidth × videoHeight) · ${dimensions(attempt.frame)}`,
      `    Ετικέτα κάμερας (MediaStreamTrack.label) · ${value(attempt.label)}`,
      `    Κάμερες βίντεο (enumerateDevices()) · ${value(attempt.cameraCount)}`,
      `    getSettings() · ${reportedSettings.join(' · ')}`,
      `    getCapabilities() · ${reportedCapabilities.join(' · ')}`,
    );
  }
}

function appendPhoto(lines, result) {
  if (!result?.request) return;
  const { capabilities, take, grab } = result;
  lines.push(
    `  Αίτημα ροής ${dimensions(result.request)} (ideal)`,
    `  getPhotoCapabilities() · ${formatStatus(capabilities)}`,
  );
  if (capabilities?.state === 'done') {
    lines.push(
      `    Πλάτος ${range(capabilities.imageWidth)} · ύψος ${range(capabilities.imageHeight)} · fillLightMode ${modes(capabilities.fillLightMode)} · redEyeReduction ${value(capabilities.redEyeReduction)}`,
    );
  }
  lines.push(`  takePhoto() με προεπιλογές · ${formatStatus(take)}`);
  if (take?.state === 'done' || take?.state === 'partial') {
    lines.push(`    Αποκωδικοποίηση ${decodedDimensions(take)} · ${value(take.decoder)} · τύπος ${value(take.type)} · χρόνος λήψης ${value(take.elapsedMs, ' ms', oneDecimal)}`);
  }
  lines.push(`  grabFrame() · ${formatStatus(grab)}`);
  if (grab?.state === 'done') {
    lines.push(`    Μέγεθος ImageBitmap ${dimensions(grab.size)} · χρόνος ${value(grab.elapsedMs, ' ms', oneDecimal)}`);
  }
}

function appendSpeed(lines, result) {
  if (!result?.request) return;
  const origin = result.usedLive
    ? 'βήμα ζωντανής κάμερας'
    : 'νέα δοκιμή προφίλ κάμερας';
  lines.push(
    `  Μεγαλύτερο πρώτο καρέ (${origin}) · ${dimensions(result.reference)}`,
    `  Αίτημα ροής ${dimensions(result.request)} (ideal) · καμβάς ${dimensions(result.frame)}`,
  );
  if (!Number.isFinite(result.windowMs)) return;
  lines.push(
    `  Πηγή καρέ · ${value(result.method)}`,
    `  Ολοκληρωμένες επεξεργασίες σε ${value(result.windowMs / 1000, ' δευτ.', threeDecimals)} · ${value(result.frames)} · ${processingRate(result)}`,
    `  Χρόνος ανά καρέ · μέσος ${value(result.meanMs, ' ms', oneDecimal)} · χειρότερος ${value(result.worstMs, ' ms', oneDecimal)}`,
    `  Τελευταία διασπορά Λαπλασιανής στο κεντρικό τέταρτο · ${value(result.lastVariance, '', threeDecimals)}`,
  );
}

function appendFile(lines, result) {
  if (!Number.isFinite(result?.bytes)) return;
  lines.push(`  File.type · ${value(result.type)} · File.size · ${value(result.bytes, ' bytes')}`);
  const exif = result.exif;
  if (exif?.format === 'jpeg') {
    const warning = result.jpegHasEnd === false ? ' · το αρχείο φαίνεται κομμένο' : '';
    lines.push(`  Διαστάσεις στο αρχείο (JPEG SOF) · ${dimensions(result.storedSize)}${warning}`);
  }
  lines.push(`  Διαστάσεις μετά τον προσανατολισμό · ${decodedDimensions(result)} · ${value(result.decoder)}`);
  if (!exif) {
    lines.push(`  EXIF · ${MISSING}`);
    return;
  }
  if (exif.format !== 'jpeg') {
    lines.push('  δεν διαβάστηκε EXIF από αυτόν τον τύπο');
    return;
  }
  lines.push(exif.incomplete ? '  EXIF JPEG APP1 · ελλιπές ή μη έγκυρο τμήμα' : '  EXIF JPEG APP1');
  for (const [field, unit, number] of [
    ['FocalLength', ' mm', twoDecimals], ['FocalLengthIn35mmFilm', ' mm', twoDecimals], ['Orientation', ''],
    ['Make', ''], ['Model', ''], ['PixelXDimension', ' px'], ['PixelYDimension', ' px'],
  ]) {
    const rendered = value(exif.fields?.[field], unit, number);
    lines.push(`    ${field} · ${rendered === MISSING ? 'λείπει' : rendered}`);
  }
}

function appendTilt(lines, result) {
  if (result && 'permission' in result) {
    lines.push(`  Απάντηση άδειας κλίσης (requestPermission) · ${value(result.permission)}`);
  }
  if (!Number.isFinite(result?.events)) return;
  lines.push(
    `  Γεγονότα σε ${value(result.windowMs / 1000, ' δευτ.', threeDecimals)} · ${value(result.events)} · ${value(result.hz, ' γεγονότα/δευτ.', threeDecimals)}`,
    `  Τελευταίες τιμές · beta ${value(result.beta, '°', twoDecimals)} · gamma ${value(result.gamma, '°', twoDecimals)}`,
  );
}

export function formatSummary(results = {}, date = new Date()) {
  const environment = results.environment;
  const lines = [
    `Πειραματικό · Έλεγχος κάμερας V1 · έκδοση ${PROBE_VERSION} · ${localDateTime.format(date)}`,
    'Προέλευση · αυτός ο browser και οι δοκιμές που ζητήθηκαν στη σελίδα.',
    '',
    `Browser (navigator.userAgent) · ${value(environment?.userAgent)}`,
    `Οθόνη (screen.width × screen.height) · ${dimensions(environment?.screen, ' CSS px')}`,
    `devicePixelRatio · ${value(environment?.pixelRatio)}`,
  ];

  for (const [key, title, append] of [
    ['live', 'Ζωντανή κάμερα (getUserMedia)', appendCamera],
    ['photo', 'Φωτογραφία από τη ροή (ImageCapture)', appendPhoto],
    ['speed', 'Ταχύτητα επεξεργασίας (καμβάς)', appendSpeed],
    ['file', 'Αρχείο φωτογραφίας (επιλογή αρχείου)', appendFile],
    ['tilt', 'Κλίση (deviceorientation)', appendTilt],
  ]) {
    const result = results[key];
    lines.push('', `${title} · ${formatStatus(result)}`);
    append(lines, result);
  }
  return lines.join('\n');
}

export function formatStepStatus(key, result) {
  const status = formatStatus(result);
  let metric;
  if (key === 'live') {
    const frames = result?.attempts?.filter((attempt) => attempt.frame);
    if (frames?.length) metric = frames.map((attempt) => dimensions(attempt.frame)).join(', ');
  }
  if (key === 'photo' && result?.take?.size) metric = decodedDimensions(result.take);
  if (key === 'speed' && Number.isFinite(result?.fps)) metric = processingRate(result);
  if (key === 'file' && result?.size) metric = decodedDimensions(result);
  if (key === 'tilt' && result?.events > 0) metric = value(result.hz, ' γεγονότα/δευτ.', threeDecimals);
  return metric ? `${status} · ${metric}` : status;
}
