// Πειραματικό · πρότυπα οθόνης · WebApp 0.1.0.
import { APP_VERSION, COINS, MATURITY, coinById } from '../core/catalog.mjs';
import { CHECKER_VERSION, disagreement, evaluationDifference } from '../core/measurement.mjs';
import { outlineEdge, parseDecimal, pickedRegion, supportFor } from './model.mjs';

const stages = [
  ['image', 'Εικόνα'], ['scale', 'Κλίμακα'], ['contour', 'Περίγραμμα'], ['results', 'Αποτέλεσμα'], ['export', 'Αρχείο'],
];
const icons = {
  scope: '<circle cx="12" cy="12" r="6"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  warning: '<path d="M10.3 4.4 2.8 18a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L13.7 4.4a1.9 1.9 0 0 0-3.4 0ZM12 9v4m0 3h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  line: '<path d="M4 12h16"/>',
  dash: '<path d="M3 12h4m3 0h4m3 0h4"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
  camera: '<path d="M4 7h4l2-3h4l2 3h4a2 2 0 0 1 2 2v10H2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3"/>',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const e = escapeHtml;
const icon = (name, className = '') => '<svg class="icon ' + className + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
export const number = (value, digits = 3) => new Intl.NumberFormat('el-GR', {
  useGrouping: false, maximumFractionDigits: digits,
}).format(value);
const uncertainty = value => value < 0.001 ? value.toExponential(2).replace('.', ',') : number(value);
const meta = (origin, method, version = APP_VERSION) => '<small class="meta">' + e([MATURITY, origin, method, version].join(' · ')) + '</small>';
const shortMeta = (origin, method) => meta(origin, method, APP_VERSION);

function button(label, { action, variant = 'secondary', glyph, id, disabled, busy, submit, pressed } = {}) {
  return '<button type="' + (submit ? 'submit' : 'button') + '" data-variant="' + variant + '"'
    + (action ? ' data-action="' + e(action) + '"' : '') + (id ? ' id="' + e(id) + '"' : '')
    + (disabled ? ' disabled' : '') + (busy ? ' aria-busy="true"' : '')
    + (pressed === undefined ? '' : ' aria-pressed="' + pressed + '"') + '>'
    + e(label) + (glyph ? icon(glyph) : '') + '</button>';
}

function notice({ tone = 'info', text, key }) {
  const glyph = tone === 'success' ? 'check' : ['warning', 'error'].includes(tone) ? 'warning' : 'info';
  return '<div class="notice ' + e(tone) + '"' + (key ? ' data-notice="' + e(key) + '"' : '')
    + (tone === 'error' ? ' role="alert"' : '') + '>' + icon(glyph) + '<p>' + e(text) + '</p></div>';
}

const fieldError = (state, name) => state.notice?.field === name;

function field(state, name, label, { help, metaText, numeric, placeholder } = {}) {
  const invalid = fieldError(state, name);
  const details = [help || metaText ? name + '-help' : null, invalid ? 'stage-notice' : null].filter(Boolean);
  return '<div class="field"><label for="' + name + '">' + e(label) + '</label>'
    + '<input id="' + name + '" name="' + name + '" type="text" value="' + e(state.form[name]) + '"'
    + (numeric ? ' inputmode="decimal" autocomplete="off"' : ' autocomplete="off"')
    + (placeholder ? ' placeholder="' + e(placeholder) + '"' : '')
    + (invalid ? ' aria-invalid="true"' : '') + (details.length ? ' aria-describedby="' + details.join(' ') + '"' : '') + '>'
    + (help || metaText ? '<div id="' + name + '-help">' + (help ? '<p class="help">' + e(help) + '</p>' : '') + (metaText ?? '') + '</div>' : '') + '</div>';
}

function choices(state, name, label, options, { vertical = false, describedBy } = {}) {
  const invalid = fieldError(state, name);
  return '<fieldset class="choice-set"' + (invalid ? ' aria-invalid="true"' : '')
    + (invalid || describedBy ? ' aria-describedby="' + [describedBy, invalid ? 'stage-notice' : null].filter(Boolean).join(' ') + '"' : '') + '>'
    + '<legend>' + e(label) + '</legend><div class="' + (vertical ? 'stack' : 'choice-grid') + '">'
    + options.map(({ value, text, checked = state.form[name] === String(value), disabled = false }) =>
      '<label class="choice"><input type="radio" name="' + name + '" id="' + name + '-' + e(value)
        + '" value="' + e(value) + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '')
        + '><span>' + e(text) + '</span></label>').join('') + '</div></fieldset>';
}

function checkChoice(state, name, label) {
  return '<label class="choice"><input type="checkbox" name="' + name + '" id="' + name + '"'
    + (state.form[name] ? ' checked' : '') + (fieldError(state, name) ? ' aria-invalid="true" aria-describedby="stage-notice"' : '')
    + '><span>' + e(label) + '</span></label>';
}

function range(state, name, label, min, max, step, suffix, stamp) {
  const invalid = fieldError(state, name);
  return '<div class="field"><label for="' + name + '">' + e(label) + '</label>'
    + '<input type="range" id="' + name + '" name="' + name + '" min="' + min + '" max="' + max + '" step="' + step
    + '" value="' + e(state.form[name]) + '" aria-describedby="' + name + '-status' + (invalid ? ' stage-notice' : '')
    + '"' + (invalid ? ' aria-invalid="true"' : '') + '>'
    + '<div id="' + name + '-status"><output class="reading" for="' + name + '" data-reading="' + name + '" data-suffix="' + suffix + '">'
    + number(Number(state.form[name]), 2) + e(suffix) + '</output>' + stamp + '</div></div>';
}

export function coinPicker(state, name, label) {
  const value = coinById(state.form[name]);
  const open = state.openPicker === name;
  const invalid = fieldError(state, name);
  const labelText = value ? value.label + ' · ' + number(value.diameter, 2) + ' mm' : 'Διάλεξε κέρμα';
  return '<div class="field"><label id="' + name + '-label" for="' + name + '">' + e(label) + '</label><div class="coin-picker">'
    + '<button type="button" id="' + name + '" data-coin-trigger="' + name + '" aria-haspopup="listbox" aria-expanded="' + open
    + '" aria-controls="' + name + '-list" aria-labelledby="' + name + '-label ' + name + '-value" aria-describedby="' + name + '-meta'
    + (invalid ? ' stage-notice" aria-invalid="true' : '') + '"><span id="' + name + '-value">' + e(labelText) + '</span>' + icon('chevron') + '</button>'
    + '<ul class="listbox" id="' + name + '-list" role="listbox" tabindex="-1" aria-labelledby="' + name + '-label"' + (open ? '' : ' hidden') + '>'
    + COINS.map(coin => '<li role="option" id="' + name + '-opt-' + coin.id + '" data-coin="' + coin.id + '"'
      + ' aria-selected="' + (coin.id === value?.id) + '"><span>' + e(coin.label) + '</span><span>' + number(coin.diameter, 2) + ' mm</span>'
      + (coin.note ? '<small class="meta">' + e(coin.note) + '</small>' : '') + '</li>').join('')
    + '</ul></div><div id="' + name + '-meta">' + (value?.note ? '<p class="help">' + e(value.note) + '</p>' : '')
    + shortMeta('δημοσιευμένες διαστάσεις', 'ΕΚΤ, κατάλογος WebApp') + '</div></div>';
}

function details(state, name, label, body) {
  return '<details class="details" id="' + name + '"' + (state.openPanels.includes(name) ? ' open' : '') + '><summary>'
    + e(label) + icon('chevron') + '</summary><div class="stack">' + body + '</div></details>';
}

const numericFields = (state, entries, stamp = shortMeta('χειροκίνητο', 'δήλωση')) => '<div class="field-pair">'
  + entries.map(([name, label]) => field(state, name, label, { numeric: true, metaText: stamp })).join('') + '</div>';

const svgCoordinate = value => Math.round(value * 1000) / 1000;
function pathData(points, closed = true) {
  return points?.length ? 'M' + points.map(point => point.map(svgCoordinate).join(' ')).join(' L') + (closed ? ' Z' : '') : '';
}

function markedPoint(form, prefix) {
  const point = [parseDecimal(form[prefix + 'X']), parseDecimal(form[prefix + 'Y'])];
  return point.every(Number.isFinite) ? point : null;
}

export function overlayContents(state) {
  const mark = (path, type) => '<path class="halo" d="' + path + '"/><path class="' + type + '" d="' + path + '"/>';
  const ref = pickedRegion(state, 'referenceId');
  const support = supportFor(state);
  const radius = state.image ? Math.min(state.image.info.width_px, state.image.info.height_px) / 90 : 4;
  const dot = (point, size = radius) => '<circle class="marker" cx="' + point[0] + '" cy="' + point[1] + '" r="' + size + '"/>';
  let shapes = state.regions.map((region, index) => mark(pathData(region.points), 'outline')
    + '<text x="' + region.center[0] + '" y="' + region.center[1] + '">' + (index + 1) + '</text>').join('');
  if (ref) shapes += mark(pathData(ref.points), 'reference');
  if (support) {
    shapes += mark(pathData(support.selected, support.mode === 'full'), 'selection');
    if (support.mode === 'arc') shapes += dot(support.selected[0]) + dot(support.selected.at(-1));
    if (support.anchor) shapes += dot(support.anchor, radius * 0.65);
  }
  for (const prefix of ['reference', 'target']) {
    const point = markedPoint(state.form, prefix);
    if (point) shapes += dot(point);
  }
  if (state.form.purpose === 'evaluation') {
    const marks = ['controlStart', 'controlEnd'].map(prefix => markedPoint(state.form, prefix)).filter(Boolean);
    if (marks.length === 2) shapes += mark(pathData(marks, false), 'outline');
    shapes += marks.map(point => dot(point, radius * 0.8)).join('');
  }
  return shapes;
}

function viewer(state) {
  let body;
  let caption = '';
  if (state.camera && state.camera !== 'requesting') {
    body = state.cameraStillUrl
      ? '<div class="image-stage"><img src="' + e(state.cameraStillUrl) + '" alt="Συνθετικό δείγμα προεπισκόπησης κάμερας"></div>'
      : '<div class="image-stage"><video id="camera-preview" class="camera-preview" autoplay muted playsinline aria-label="Ζωντανή προεπισκόπηση κάμερας"></video></div>';
    caption = '<figcaption class="image-caption"><p class="quiet">Προεπισκόπηση κάμερας</p></figcaption>';
  } else if (state.camera === 'requesting') {
    body = '<div class="image-well"><div class="image-empty">' + icon('camera')
      + '<p><strong>Περιμένω άδεια κάμερας</strong></p><p class="quiet">Απάντησε στο αίτημα του browser ή ακύρωσε τη λήψη.</p></div></div>';
  } else if (state.image) {
    const { info, stillUrl, name } = state.image;
    const size = ' width="' + info.width_px + '" height="' + info.height_px + '"';
    const description = 'Εικόνα αντικειμένων με τα περιγράμματα. Οι επιλογές της φόρμας δίνουν και χειρισμό με πληκτρολόγιο.';
    const raster = stillUrl ? '<img src="' + e(stillUrl) + '"' + size + ' alt="' + description + '">'
      : '<canvas id="raster"' + size + ' role="img" aria-label="' + description + '">Εικόνα εργασίας.</canvas>';
    body = '<div class="image-stage" id="image-stage"' + (state.pick ? ' data-pick="' + e(state.pick) + '"' : '') + '>'
      + raster + '<svg class="overlay" id="image-overlay" viewBox="-0.5 -0.5 ' + info.width_px + ' ' + info.height_px
      + '" aria-hidden="true">' + overlayContents(state) + '</svg></div>';
    caption = '<figcaption class="image-caption"><p class="quiet">' + e(name) + '</p>'
      + '<p class="reading">' + info.width_px + ' × ' + info.height_px + ' px</p>'
      + shortMeta(state.form.provenance === 'synthetic' ? 'συνθετικό' : 'αντικείμενο', 'διαστάσεις εικόνας')
      + (state.regions.length ? '<ul class="legend"><li>' + icon('dash') + 'Υποψήφιο όριο</li>'
        + (pickedRegion(state, 'referenceId') ? '<li>' + icon('line') + 'Αναφορά</li>' : '')
        + (supportFor(state) ? '<li>' + icon('line', 'selected-mark') + 'Επιλογή</li>' : '')
        + (state.form.purpose === 'evaluation' && markedPoint(state.form, 'controlStart')
          ? '<li>' + icon('dot', 'selected-mark') + 'Σημάδι δεύτερου μήκους</li>' : '') + '</ul>'
        + shortMeta('εκτίμηση', 'όριο με παρεμβολή στο κατώφλι') : '') + '</figcaption>';
  } else {
    body = '<div class="image-well"><div class="image-empty">' + icon('image')
      + '<p><strong>Εδώ θα δεις το περίγραμμα</strong></p><p class="quiet">Φόρτωσε μια εικόνα με το αντικείμενο και την αναφορά του.</p></div></div>';
  }
  return '<figure class="viewer" aria-labelledby="viewer-title"><div class="viewer-head"><h2 id="viewer-title">Εικόνα εργασίας</h2>'
    + '<span class="meta">Στη μνήμη της σελίδας</span></div>' + body + caption + '</figure>';
}

function stageNotice(state) {
  return state.notice ? '<div id="stage-notice">' + notice(state.notice) + '</div>' : '';
}

function stageHeading(title, text) {
  return '<div class="stack"><h2 id="stage-title" tabindex="-1">' + e(title) + '</h2>' + (text ? '<p class="quiet">' + e(text) + '</p>' : '') + '</div>';
}

function adjustThreshold(state) {
  return '<div class="stack">' + range(state, 'threshold', 'Κατώφλι φωτεινότητας', 0, 254, 1, '',
    shortMeta('εκτίμηση Otsu ή χειροκίνητο', 'ανίχνευση ορίου'))
    + '<div class="actions">' + button(state.busy === 'threshold' ? 'Βρίσκω περιγράμματα' : 'Εφάρμοσε κατώφλι',
      { action: 'threshold', id: 'apply-threshold', busy: state.busy === 'threshold' }) + '</div></div>';
}

function cameraPanel(state) {
  const ready = state.camera === 'ready', capturing = state.camera === 'capturing';
  const label = ready ? 'Τράβηξε καρέ' : capturing ? 'Διαβάζω καρέ' : state.camera === 'starting' ? 'Ανοίγω προεπισκόπηση' : 'Περιμένω άδεια';
  return stageHeading('Λήψη από κάμερα', 'Βάλε τα αντικείμενα σε ανοιχτό, ομοιόμορφο φόντο. Κράτησε χέρια και ανθρώπους έξω από το κάδρο.')
    + stageNotice(state) + '<div class="actions">'
    + button(label, { action: 'capture-camera', variant: 'primary', glyph: 'camera', id: 'capture-camera', busy: !ready })
    + button('Ακύρωσε λήψη', { action: 'cancel-camera', id: 'cancel-camera' }) + '</div>';
}

function imagePanel(state) {
  if (state.camera) return cameraPanel(state);
  const loaded = state.image !== null;
  const enough = state.regions.length >= 2;
  return stageHeading(loaded ? 'Εικόνα έτοιμη' : 'Πρόσθεσε εικόνα', loaded
    ? 'Χρειάζεσαι δύο χωριστά περιγράμματα. Το ένα θα δώσει την κλίμακα.'
    : 'Βάλε τα αντικείμενα σε ανοιχτό, ομοιόμορφο φόντο. Κράτησε χέρια και ανθρώπους έξω από το κάδρο.')
    + stageNotice(state)
    + '<input type="file" id="image-file" aria-label="Διάλεξε αρχείο εικόνας" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" hidden>'
    + '<div class="actions">'
    + (loaded ? button('Όρισε κλίμακα', { action: 'to-scale', variant: 'primary', id: 'to-scale', disabled: !enough || state.busy }) : '')
    + button(state.busy === 'file' ? 'Ανοίγω εικόνα' : loaded ? 'Άλλαξε εικόνα' : 'Φόρτωσε εικόνα',
      { action: 'file', variant: loaded ? 'secondary' : 'primary', glyph: 'folder', id: 'choose-file', busy: state.busy === 'file' })
    + button('Άνοιξε κάμερα', { action: 'open-camera', id: 'open-camera', glyph: 'camera', disabled: state.busy === 'file' })
    + (loaded && state.busy !== 'file' ? button('Αφαίρεσε εικόνα', { action: 'reset', variant: 'destructive' }) : '')
    + '</div>'
    + (loaded && !enough ? adjustThreshold(state) : '')
    + choices(state, 'provenance', 'Προέλευση εικόνας', [
      { value: 'object', text: 'Φωτογραφία αντικειμένων' }, { value: 'synthetic', text: 'Τεχνητή εικόνα' },
    ])
    + (state.form.provenance === 'synthetic'
      ? '<div class="field-pair">' + field(state, 'generatorId', 'Γεννήτρια εικόνας')
        + field(state, 'generatorVersion', 'Έκδοση γεννήτριας', { metaText: shortMeta('χειροκίνητο', 'δήλωση γεννήτριας') }) + '</div>' : '')
    + choices(state, 'purpose', 'Σκοπός', [
      { value: 'measurement', text: 'Απλή μέτρηση' }, { value: 'evaluation', text: 'Δοκιμή αξιολόγησης' },
    ])
    + (state.form.purpose === 'evaluation' ? '<p class="help">Βάλε δύο διαφορετικά κέρματα κοντά στο κέντρο της εικόνας. Κράτησε την κάμερα κάθετη στο χαρτί. Πρόσθεσε ανεξάρτητο γνωστό μήκος στο ύψος του χείλους της αναφοράς.</p>' : '');
}

function objectChoices(state, name, label) {
  const reference = name === 'targetId' ? state.form.referenceId : null;
  return choices(state, name, label, state.regions.map((region, index) => ({
    value: region.id, text: 'Αντικείμενο ' + (index + 1), disabled: String(region.id) === reference,
  })), { describedBy: name + '-meta' })
    + '<div id="' + name + '-meta">' + shortMeta('εκτίμηση', 'αρίθμηση περιοχών εικόνας') + '</div>';
}

function outlineFields(state, prefix) {
  const key = prefix + 'Edge', edge = outlineEdge(state.form, key);
  const labels = [
    ['unresolved', 'Αβέβαιο χείλος'], ['upper_rim', 'Άνω χείλος'], ['outer_silhouette', 'Εξωτερική σιλουέτα'],
  ];
  if (state.form.purpose !== 'evaluation' || state.form.provenance === 'synthetic') labels.push(['planar_trace', 'Επίπεδη χάραξη']);
  const allowMark = edge !== 'upper_rim' || prefix === 'target';
  const coin = prefix === 'reference' ? coinById(state.form.coinId) : coinById(state.form.targetCoinId);
  return choices(state, key, 'Ποιο όριο φαίνεται', labels.map(([value, text]) => ({ value, text, checked: value === edge })))
    + (edge === 'planar_trace' ? '' : field(state, prefix + 'Thickness', 'Πάχος (mm)', {
      help: coin && (state.form.dimensionKind === 'coin' || prefix === 'target')
        ? 'Κενό πεδίο χρησιμοποιεί το δημοσιευμένο πάχος του κέρματος.' : 'Άφησέ το κενό αν αγνοείται.', metaText: shortMeta('χειροκίνητο', 'δήλωση πάχους'), numeric: true,
    }))
    + (allowMark ? numericFields(state, [[prefix + 'X', 'Κέντρο x (px)'], [prefix + 'Y', 'Κέντρο y (px)']])
      + '<div class="actions">' + button(state.pick === prefix + 'Center' ? 'Ακύρωσε σήμανση' : 'Σήμανε κέντρο στην εικόνα',
        { action: 'pick-' + prefix + 'Center', id: 'pick-' + prefix + 'Center', pressed: state.pick === prefix + 'Center' }) + '</div>' : '');
}

function evaluationControl(state) {
  const endpoint = (prefix, label) => '<div class="stack">'
    + numericFields(state, [[prefix + 'X', label + ' x (px)'], [prefix + 'Y', label + ' y (px)']])
    + '<div class="actions">' + button(state.pick === prefix ? 'Ακύρωσε σήμανση' : 'Σήμανε ' + label.toLocaleLowerCase('el'),
      { action: 'pick-' + prefix, id: 'pick-' + prefix, pressed: state.pick === prefix }) + '</div></div>';
  return details(state, 'evaluation-control', 'Δεύτερο γνωστό μήκος', '<p class="help">Χρησιμοποίησε δύο σημάδια χάρακα ή τη διάμετρο τρίτου κέρματος. Σημείωσε τα άκρα στην ίδια εικόνα ή γράψε τις συντεταγμένες.</p>'
    + choices(state, 'controlKind', 'Είδος δεύτερου μήκους', [
      { value: 'segment', text: 'Τμήμα χάρακα' }, { value: 'circle', text: 'Διάμετρος τρίτου κέρματος' },
    ]) + endpoint('controlStart', 'Πρώτο άκρο') + endpoint('controlEnd', 'Δεύτερο άκρο')
    + numericFields(state, [['controlLength', 'Γνωστό μήκος (mm)'], ['controlUncertaintyMm', 'Αβεβαιότητα μήκους (mm)'],
      ['controlUncertaintyPx', 'Αβεβαιότητα εικόνας (px)']])
    + field(state, 'controlSource', 'Πηγή μήκους και αβεβαιοτήτων')
    + checkChoice(state, 'controlIndependent', 'Το μήκος είναι ανεξάρτητο και στο ίδιο επίπεδο με την αναφορά'));
}

function viewFields(state) {
  return details(state, 'view-geometry', 'Ύψη και απόσταση φακού',
    '<p class="help">Άφησε κενό ό,τι αγνοείς. Οι αποστάσεις μετρώνται από το χαρτί.</p>'
    + numericFields(state, [['cameraDistance', 'Απόσταση φακού (mm)'], ['cameraUncertainty', 'Αβεβαιότητα απόστασης (mm)'],
      ['referenceHeight', 'Ύψος αναφοράς (mm)'], ['referenceHeightUncertainty', 'Αβεβαιότητα ύψους αναφοράς (mm)'],
      ['contourHeight', 'Ύψος αντικειμένου (mm)'], ['contourHeightUncertainty', 'Αβεβαιότητα ύψους αντικειμένου (mm)']]));
}

function scalePanel(state) {
  const evaluation = state.form.purpose === 'evaluation';
  return stageHeading('Όρισε την κλίμακα', evaluation
    ? 'Διάλεξε το κέρμα αναφοράς και όρισε το ανεξάρτητο μήκος της δοκιμής.'
    : 'Διάλεξε το κυκλικό αντικείμενο αναφοράς και δώσε τη γνωστή διάμετρό του.')
    + stageNotice(state) + '<form data-submit="scale" novalidate>'
    + objectChoices(state, 'referenceId', 'Αντικείμενο αναφοράς')
    + (evaluation ? '' : choices(state, 'dimensionKind', 'Γνωστή διάμετρος', [{ value: 'coin', text: 'Κέρμα ευρώ' }, { value: 'manual', text: 'Δική μου τιμή' }]))
    + (evaluation || state.form.dimensionKind === 'coin'
      ? coinPicker(state, 'coinId', 'Κέρμα αναφοράς')
      : field(state, 'diameter', 'Διάμετρος (mm)', { numeric: true, help: 'Εύρος 10 έως 50 mm κατά το συμβόλαιο.',
        metaText: meta('χειροκίνητο', 'δήλωση διαμέτρου · συμβόλαιο', '0.3') }))
    + '<div class="field-pair">'
    + field(state, 'referenceUncertaintyMm', 'Τυπική αβεβαιότητα (mm)', { numeric: true, help: 'Για τη γνωστή διάμετρο.', metaText: shortMeta('χειροκίνητο', 'δήλωση αβεβαιότητας') })
    + field(state, 'referenceUncertaintyPx', 'Τυπική αβεβαιότητα (px)', { numeric: true, help: 'Για τη διάμετρο στην εικόνα.', metaText: shortMeta('χειροκίνητο', 'δήλωση αβεβαιότητας') })
    + '</div>' + field(state, 'referenceSource', 'Πηγή διαμέτρου και αβεβαιοτήτων', {
      help: state.form.dimensionKind === 'coin' ? 'Η διάμετρος του κέρματος έρχεται από τον κατάλογο. Γράψε πώς βρήκες τις αβεβαιότητες.'
        : 'Γράψε από πού πήρες τη διάμετρο και πώς βρήκες τις αβεβαιότητες.',
    })
    + details(state, 'reference-geometry', 'Χείλος και θέση της αναφοράς', outlineFields(state, 'reference'))
    + viewFields(state)
    + (evaluation ? evaluationControl(state) : '')
    + details(state, 'scale-threshold', 'Ρύθμιση κατωφλίου', adjustThreshold(state))
    + '<div class="actions">' + button('Χρησιμοποίησε την κλίμακα', { submit: true, variant: 'primary', id: 'set-scale' })
    + button('Πίσω στην εικόνα', { action: 'back-image' }) + '</div></form>';
}

const scaleLabels = {
  usable: 'Υπολογίστηκε τυπική αβεβαιότητα κλίμακας.',
  tilt_flagged: 'Η αναφορά φαίνεται ελλειπτική. Έλεγξε τη θέση της κάμερας και την επιλογή της αναφοράς.',
  unknown_geometry: 'Η κλίμακα είναι ονομαστική στο επίπεδο αναφοράς. Τα ύψη ή η απόσταση του φακού είναι άγνωστα.',
  unknown_height_uncertainty: 'Λείπει αβεβαιότητα ύψους ή απόστασης φακού.',
  unknown_rim: 'Το συστηματικό περιθώριο του χείλους είναι άγνωστο.',
  nonlinear: 'Οι δηλωμένες αβεβαιότητες ξεπερνούν το όριο της γραμμικής διάδοσης.',
};

function scaleSummary(scale) {
  if (!scale) return '';
  const stamp = meta('εκτίμηση', 'κλίμακα από αναφορά, συμβόλαιο', '0.3');
  return '<div class="stack"><p>Κλίμακα <strong class="reading">' + number(scale.mm_per_px, 6) + ' mm/px</strong></p>' + stamp
    + (scale.scale_uncertainty_mm_per_px === null ? ''
      : '<p>Τυπική αβεβαιότητα κλίμακας <strong class="reading">'
        + uncertainty(scale.scale_uncertainty_mm_per_px) + ' mm/px</strong></p>' + stamp)
    + '<p class="help">' + e(scaleLabels[scale.scale_status]) + '</p></div>';
}

function evaluationSupport(state) {
  return coinPicker(state, 'targetCoinId', 'Κέρμα που μετράς')
    + '<p class="help">Θα μετρηθούν ολόκληρο το περίγραμμα και ένα τρίτο του. Διάλεξε το σταθερό σημάδι γύρω από το οποίο θα κεντραριστεί το τόξο.</p>'
    + range(state, 'anchorPercent', 'Σημάδι στο περίγραμμα', 0, 100, 0.01, '%', shortMeta('χειροκίνητο', 'άγκυρα τόξου'))
    + '<div class="actions">' + button(state.pick === 'anchorPercent' ? 'Ακύρωσε σήμανση' : 'Δείξε σημάδι στην εικόνα',
      { action: 'pick-anchorPercent', id: 'pick-anchorPercent', pressed: state.pick === 'anchorPercent' }) + '</div>'
    + choices(state, 'evaluationScope', 'Προβολή επιλογής', [
      { value: 'full', text: 'Ολόκληρο' }, { value: 'third', text: 'Ένα τρίτο' },
    ]);
}

function contourPanel(state) {
  const evaluation = state.form.purpose === 'evaluation';
  const isArc = !evaluation && state.form.selectionMode === 'arc';
  return stageHeading('Διάλεξε περίγραμμα', evaluation
    ? 'Διάλεξε το δεύτερο κέρμα και όρισε το σημάδι του τόξου.'
    : 'Δείξε ποιο αντικείμενο μετράς. Κράτησε μόνο το καμπύλο τμήμα όταν υπάρχει ευθύ κομμάτι.')
    + stageNotice(state) + scaleSummary(state.scale)
    + '<form data-submit="measure" novalidate>' + objectChoices(state, 'targetId', 'Αντικείμενο μέτρησης')
    + (evaluation ? evaluationSupport(state)
      : choices(state, 'selectionMode', 'Τμήμα περιγράμματος', [{ value: 'full', text: 'Ολόκληρο' }, { value: 'arc', text: 'Τόξο' }]))
    + (isArc ? '<p class="help">Κίνησε την αρχή και το τέλος με τα βέλη του πληκτρολογίου ή δείξε τα πάνω στην εικόνα. Η επιλογή ακολουθεί το περίγραμμα δεξιόστροφα.</p>'
      + '<div class="field-pair">'
      + range(state, 'arcStart', 'Αρχή τόξου', 0, 100, 0.01, '%', shortMeta('χειροκίνητο', 'θέση στο περίγραμμα'))
      + range(state, 'arcEnd', 'Τέλος τόξου', 0, 100, 0.01, '%', shortMeta('χειροκίνητο', 'θέση στο περίγραμμα'))
      + '</div><div class="actions">'
      + button(state.pick === 'arcStart' ? 'Ακύρωσε σήμανση' : 'Δείξε αρχή στην εικόνα', { action: 'pick-arcStart', id: 'pick-arcStart', pressed: state.pick === 'arcStart' })
      + button(state.pick === 'arcEnd' ? 'Ακύρωσε σήμανση' : 'Δείξε τέλος στην εικόνα', { action: 'pick-arcEnd', id: 'pick-arcEnd', pressed: state.pick === 'arcEnd' })
      + '</div>' : '')
    + checkChoice(state, 'materialInside', 'Το υλικό βρίσκεται μέσα στο περίγραμμα')
    + details(state, 'target-geometry', 'Χείλος και θέση του αντικειμένου', outlineFields(state, 'target'))
    + viewFields(state)
    + details(state, 'contour-threshold', 'Ρύθμιση κατωφλίου', adjustThreshold(state))
    + '<div class="actions">' + button(state.busy === 'measure' ? 'Υπολογίζω τις ακτίνες'
      : evaluation ? 'Μέτρησε πλήρες και τόξο' : 'Υπολόγισε ακτίνες',
      { submit: true, variant: 'primary', id: 'measure', busy: state.busy === 'measure' })
    + button('Πίσω στην κλίμακα', { action: 'back-scale' }) + '</div></form>';
}

const titles = { 'taubin-v0': 'Taubin', 'triplet-median-v0': 'Διάμεσος τριάδων' };

function methodResult(method, knownCoin) {
  const { raw, derived } = method;
  const stamp = meta(raw.provenance, titles[raw.method_id], raw.method_version);
  const difference = knownCoin ? evaluationDifference(raw, knownCoin.diameter) : null;
  return '<section class="method-row"><h3>' + e(titles[raw.method_id]) + '</h3>'
    + (raw.status === 'abstain'
      ? '<p><strong>Δεν έδωσε ακτίνα</strong></p><p class="quiet">' + e(raw.reason) + '</p>' + stamp
      : '<p class="radius">' + number(raw.radius_mm) + ' <span class="unit">mm</span></p>' + stamp
        + '<p>Αβεβαιότητα μεθόδου <strong class="reading">' + uncertainty(raw.radius_uncertainty_mm) + ' mm</strong></p>' + stamp
        + '<p class="help">Συντηρητικό εύρος με σταθερή κλίμακα.</p>'
        + (derived.radius_total_uncertainty_mm === null ? '<p class="help">Συνολική αβεβαιότητα μέτρησης άγνωστη.</p>'
          : '<p>Συνολικό περιθώριο <strong class="reading">' + uncertainty(derived.radius_total_uncertainty_mm) + ' mm</strong></p>' + stamp)
        + (derived.radius_rim_systematic_mm > 0 ? '<p>Περιθώριο χείλους <strong class="reading">'
          + uncertainty(derived.radius_rim_systematic_mm) + ' mm</strong></p>' + meta('εκτίμηση', 'όρος χείλους, συμβόλαιο', '0.3') : '')
        + (difference ? '<p>Διαφορά από τη δημοσιευμένη ακτίνα <strong class="reading">' + number(difference.difference)
          + ' mm (' + number(100 * difference.relative, 2) + '%)</strong></p>'
          + meta('εκτίμηση έναντι διαμέτρου ΕΚΤ', titles[raw.method_id], raw.method_version) : '')
        + (method.measurability_flag === 'ok_below_sagitta_limit'
          ? notice({ tone: 'warning', text: 'Η μέθοδος έδωσε αριθμό κάτω από το όριο του βέλους. Διάλεξε μεγαλύτερο ή πιο καθαρό τόξο.' }) : ''))
    + '</section>';
}

function resultChoice(state) {
  return state.results.length > 1 ? choices(state, 'resultChoice', 'Επιλογή αξιολόγησης', [
    { value: '0', text: 'Ολόκληρο περίγραμμα' }, { value: '1', text: 'Ένα τρίτο' },
  ]) : '';
}

function resultPanel(state) {
  const { measurement } = state.results[state.resultIndex];
  const conflict = disagreement(measurement.methods);
  const alert = conflict === 'status' ? 'Οι μέθοδοι διαφωνούν. Η μία έδωσε ακτίνα και η άλλη αρνήθηκε. Έλεγξε αν η επιλογή περιλαμβάνει ευθύ τμήμα ή γωνία.'
    : conflict === 'radius' ? 'Οι ακτίνες διαφέρουν αισθητά. Έλεγξε αν η επιλογή περιλαμβάνει ευθύ τμήμα ή γωνία.' : '';
  const knownCoin = state.results.length > 1 ? coinById(state.form.targetCoinId) : null;
  return stageHeading('Ακτίνα καμπυλότητας', 'Οι δύο μέθοδοι χρησιμοποίησαν τα ίδια σημεία.')
    + stageNotice(state) + resultChoice(state)
    + (knownCoin ? '<div><p>Δημοσιευμένη διάμετρος κέρματος <strong class="reading">'
      + e(knownCoin.label) + ' · ' + number(knownCoin.diameter, 2) + ' mm</strong></p>'
      + shortMeta('δημοσιευμένες διαστάσεις', 'ΕΚΤ, κατάλογος WebApp') + '</div>' : '')
    + (alert ? notice({ tone: 'warning', text: alert }) : '')
    + measurement.methods.map(method => methodResult(method, knownCoin)).join('')
    + scaleSummary(measurement.calibration)
    + '<p class="help">Οι μέθοδοι εκτελούνται μέσα στη σελίδα. Η προεπισκόπηση περιέχει τις αυτούσιες εξόδους.</p>'
    + '<div class="actions">' + button('Δες προεπισκόπηση', { action: 'to-export', variant: 'primary' })
    + button('Πίσω στο περίγραμμα', { action: 'back-contour' }) + '</div>';
}

function exportPanel(state) {
  const { json, verdict, measurement } = state.results[state.resultIndex];
  const failed = verdict.results.filter(result => !result.passed);
  return stageHeading('Προεπισκόπηση αρχείου', 'Δες το JSON που θα αποθηκευτεί στη συσκευή σου.')
    + stageNotice(state) + resultChoice(state)
    + (state.results.length > 1 ? '<p class="help">Τα δύο αρχεία μοιράζονται το ίδιο αρχικό περίγραμμα. Διάλεξε κάθε επιλογή για να δεις και να κατεβάσεις το αντίστοιχο αρχείο.</p>' : '')
    + notice({ tone: verdict.passed ? 'success' : 'error',
      text: verdict.passed ? 'Το αρχείο πέρασε τον έλεγχο του συμβολαίου.'
        : 'Το αρχείο δεν πέρασε τον έλεγχο του συμβολαίου. Δες την αιτία και γύρισε στην κλίμακα ή στο περίγραμμα.' })
    + meta('έλεγχος αρχείου', 'ελεγκτής συμβολαίου', verdict.version ?? CHECKER_VERSION)
    + (failed.length ? details(state, 'failed-checks', 'Δες τους αποτυχημένους ελέγχους', '<ul class="verdict-list">'
      + failed.map(result => '<li><strong>' + e(result.id) + '</strong> ' + e(result.message) + '</li>').join('') + '</ul>') : '')
    + '<div class="stack"><h3 id="json-label">Περιεχόμενο JSON</h3>'
    + meta(measurement.provenance, 'εξαγωγέας WebApp · μορφή ' + measurement.format_version)
    + '<pre class="json" tabindex="0" aria-labelledby="json-label">' + e(json) + '</pre></div>'
    + '<div class="actions">' + button('Κατέβασε αρχείο', { action: 'download', variant: 'primary', glyph: 'download', disabled: !verdict.passed })
    + button('Πίσω στο αποτέλεσμα', { action: 'back-results' }) + '</div>';
}

const panels = { image: imagePanel, scale: scalePanel, contour: contourPanel, results: resultPanel, export: exportPanel };

export function pageContent(state) {
  const controls = '<section class="panel" aria-labelledby="stage-title">' + panels[state.step](state) + '</section>';
  const imageView = viewer(state);
  const work = state.image || state.camera ? imageView + controls : controls + imageView;
  return '<header class="masthead"><div class="layout"><p class="brand">' + icon('scope') + 'Nailform Lab</p>'
    + '<p class="meta">' + MATURITY + ' · WebApp ' + APP_VERSION + '</p></div></header>'
    + '<main id="main" class="layout"><div class="intro"><h1>Μέτρηση καμπυλότητας</h1>'
    + notice({ text: 'Η εφαρμογή δεν έχει δοκιμαστεί σε πραγματική φωτογραφία ή σε νύχι. Η εκτίμηση δεν δείχνει αν ένα νύχι θα εφαρμόσει.' })
    + '</div><ol class="steps" aria-label="Βήματα μέτρησης">'
    + stages.map(([key, title]) => '<li' + (key === state.step ? ' aria-current="step"' : '') + '>' + title + '</li>').join('')
    + '</ol><div class="workbench">' + work + '</div></main>'
    + '<footer class="footer"><div class="layout"><p>' + MATURITY + ' · Nailform Lab · WebApp ' + APP_VERSION
    + '</p><p>Επεξεργασία στη συσκευή</p></div></footer>';
}
