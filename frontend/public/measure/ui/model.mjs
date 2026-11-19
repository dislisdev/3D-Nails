// Πειραματικό · κατάσταση οθόνης · WebApp 0.2.0.
import { selectSupport } from '../core/geometry.mjs';

export function initialState() {
  return {
    step: 'image', image: null, regions: [], scale: null, notice: null,
    busy: null, camera: null, cameraSize: null, pick: null, openPicker: null, openPanels: [], results: [], resultIndex: 0,
    draft: null, cursor: null,
    form: {
      provenance: 'object', generatorId: '', generatorVersion: '', purpose: 'measurement',
      controlKind: 'segment', controlLength: '', controlUncertaintyMm: '', controlUncertaintyPx: '', controlSource: '',
      controlStartX: '', controlStartY: '', controlEndX: '', controlEndY: '',
      targetCoinId: '', anchorPercent: 0, evaluationScope: 'full', resultChoice: '0',
      referenceId: '', targetId: '', threshold: 127, manualThreshold: false, dimensionKind: 'coin', coinId: '',
      diameter: '', referenceUncertaintyMm: '', referenceUncertaintyPx: '', referenceSource: '',
      referenceEdge: '', referenceThickness: '', referenceX: '', referenceY: '',
      targetEdge: '', targetThickness: '', targetX: '', targetY: '',
      cameraDistance: '', cameraUncertainty: '', referenceHeight: '', referenceHeightUncertainty: '',
      contourHeight: '', contourHeightUncertainty: '',
      selectionMode: 'full', arcStart: 85, arcEnd: 15, materialInside: false,
    },
  };
}

export const messages = {
  fileType: 'Αυτή η μορφή εικόνας δεν ανοίγει εδώ. Διάλεξε JPEG, PNG ή WebP. Στο iPhone, για νέες φωτογραφίες, επίλεξε Ρυθμίσεις, Κάμερα, Μορφές, Υψηλή συμβατότητα (JPEG).',
  fileSize: 'Η εικόνα είναι πολύ μεγάλη για τη μνήμη αυτής της εφαρμογής. Δοκίμασε μικρότερο αρχείο ή μικρότερη ανάλυση.',
  fileRead: 'Η εικόνα δεν άνοιξε. Μπορεί το αρχείο να είναι ελλιπές. Δοκίμασε άλλο αντίγραφο της εικόνας.',
  fileCancel: 'Η επιλογή αρχείου ακυρώθηκε. Μπορείς να διαλέξεις εικόνα ξανά.',
  cameraUnavailable: 'Η ζωντανή κάμερα δεν είναι διαθέσιμη εδώ. Πάτησε «Τράβηξε φωτογραφία» ή φόρτωσε εικόνα.',
  cameraPermission: 'Δεν δόθηκε άδεια για την κάμερα. Μπορείς να την επιτρέψεις στις ρυθμίσεις του browser ή να φορτώσεις αρχείο.',
  cameraMissing: 'Δεν βρέθηκε κάμερα στη συσκευή. Σύνδεσε κάμερα ή φόρτωσε αρχείο εικόνας.',
  cameraBusy: 'Η κάμερα δεν άνοιξε. Κλείσε άλλες εφαρμογές που τη χρησιμοποιούν και δοκίμασε ξανά.',
  cameraStart: 'Η προεπισκόπηση της κάμερας διακόπηκε. Δοκίμασε να την ανοίξεις ξανά ή φόρτωσε αρχείο.',
  cameraCapture: 'Δεν αποθηκεύτηκε καρέ στη σελίδα. Άνοιξε ξανά την κάμερα ή φόρτωσε αρχείο.',
  cameraCancel: 'Η λήψη από την κάμερα ακυρώθηκε. Μπορείς να την ανοίξεις ξανά ή να φορτώσεις αρχείο.',
  sameObject: 'Αυτό είναι το κέρμα αναφοράς. Άγγιξε το άλλο αντικείμενο.',
  edge: 'Η ακμή δεν βρέθηκε. Άγγιξε μέσα στο αντικείμενο ή τράβηξε νέα φωτογραφία με ομοιόμορφο φόντο και λιγότερη σκιά.',
  referenceResolution: 'Η διάμετρος της αναφοράς στην εικόνα είναι κάτω από 300 pixel. Πάτησε «Τράβηξε φωτογραφία» ή πλησίασε τα αντικείμενα.',
  process: 'Η μέτρηση δεν ολοκληρώθηκε. Γύρισε στο περίγραμμα και δοκίμασε άλλη επιλογή.',
  export: 'Η λήψη του αρχείου δεν ξεκίνησε. Δοκίμασε ξανά από την προεπισκόπηση.',
};

export const pickedRegion = (state, key) => state.regions.find(region => String(region.id) === state.form[key]);
export const targetFor = state => (state.step === 'contour' ? state.draft?.region : null) ?? pickedRegion(state, 'targetId');
export const outlineEdge = (form, key) => form[key] || (form.provenance === 'synthetic' ? 'planar_trace' : 'unresolved');

export function supportFor(state) {
  if (!['contour', 'results', 'export'].includes(state.step)) return null;
  const result = state.results[state.resultIndex]?.measurement;
  if (result) {
    const { contour, selection } = result;
    return {
      mode: selection.mode, anchor: selection.anchor_px,
      selected: selection.point_indices_unitless.map(index => contour.points_px[index]),
    };
  }
  const target = targetFor(state);
  if (!target) return null;
  if (state.form.purpose === 'evaluation') {
    return selectSupport(target.points, { mode: state.form.evaluationScope,
      anchorFraction: Number(state.form.anchorPercent) / 100, materialInside: state.form.materialInside });
  }
  const { selectionMode, arcStart, arcEnd, materialInside } = state.form;
  return selectSupport(target.points, {
    mode: selectionMode, startFraction: Number(arcStart) / 100,
    endFraction: Number(arcEnd) / 100, materialInside,
  });
}

export function parseDecimal(raw) {
  const text = String(raw ?? '').trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return text ? NaN : null;
  return Number(text.replace(',', '.'));
}
