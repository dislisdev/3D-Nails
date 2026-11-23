import { VERSION as CORE_VERSION } from './core/multiview-arc.mjs';
import { VERSION as CARD_FOCAL_VERSION } from './card-focal.mjs';
import { MEASUREMENT_OPTIONS } from './measurement.mjs';
import { focal35ToPixels, PAGE_VERSION, photoStatus } from './views.mjs';

export const PROVENANCE = `Πειραματικό · NAILFORM LAB · Σελίδα πάγκου ${PAGE_VERSION} · Πυρήνας ${CORE_VERSION} · Εστιακή κάρτας ${CARD_FOCAL_VERSION}`;

const photoLabels = {
  unreadable: 'αδυναμία ανάγνωσης',
  'needs-corners': 'χρειάζεται γωνίες',
  'needs-edge': 'χρειάζεται άκρη',
  ready: 'έτοιμη',
};

export function photoStatusLabel(photo) {
  const status = photoStatus(photo);
  const label = photoLabels[status];
  const missingFocal = focal35ToPixels(photo.focal35Mm, photo.width, photo.height) === null;
  return status !== 'unreadable' && missingFocal ? `${label} · χωρίς εστιακή στο αρχείο` : label;
}

export function photoIssue(photo) {
  const status = photoStatus(photo);
  if (status === 'unreadable') {
    return 'Δεν διαβάστηκε η εικόνα στην πλήρη ανάλυση. Πρόσθεσε το αρχικό JPEG από την κάμερα ή τράβηξε νέα φωτογραφία.';
  }
  return '';
}

const cardOrderHelp = 'Ξεκίνα από τη σημαδεμένη γωνία, πήγαινε πρώτα στη μεγάλη πλευρά και συνέχισε αριστερόστροφα.';
const endOrderHelp = 'Σημείωσε πρώτα το Α και τελευταίο το Β, στα ίδια φυσικά σημάδια σε κάθε φωτογραφία.';

const refusalText = {
  TOO_FEW_VIEWS: 'Χρειάζονται τουλάχιστον δύο έτοιμες φωτογραφίες. Σημείωσε την κάρτα και την άκρη σε άλλη λήψη.',
  INVALID_INPUT: 'Λείπουν ή είναι άκυρα στοιχεία της εικόνας ή της κάρτας. Έλεγξε την επιβεβαίωση και πρόσθεσε το αρχικό JPEG από την κάμερα.',
  INVALID_CORNERS: `Χρειάζονται τέσσερις γωνίες της κάρτας. ${cardOrderHelp}`,
  CORNER_ORDER: `Οι γωνίες της κάρτας συμπίπτουν ή έχουν λάθος σειρά. ${cardOrderHelp}`,
  CARD_POSE_FAILED: `Η θέση της κάμερας δεν βρέθηκε από την κάρτα. Έλεγξε ότι φαίνεται ολόκληρη η πάνω έδρα. ${cardOrderHelp}`,
  CARD_REPROJECTION_HIGH: `Οι σημειωμένες γωνίες δεν ταιριάζουν με την κάρτα. Έλεγξε τις διαστάσεις της κάρτας. ${cardOrderHelp}`,
  CARD_SIDE_ORDER: `Η σειρά της μεγάλης και της μικρής πλευράς φαίνεται αλλαγμένη. ${cardOrderHelp}`,
  CARD_ORDER_UNCERTAIN: 'Η σειρά των γωνιών δεν είναι βέβαιη. Ξεκίνα από τη σημαδεμένη γωνία, πρώτα κατά μήκος της μεγάλης πλευράς.',
  CARD_FRONTAL: 'Η κάρτα φαίνεται πολύ μετωπικά. Τράβηξε νέες φωτογραφίες πιο λοξά ως προς την κάρτα.',
  FOCAL_UNCERTAIN: 'Η εστιακή από την κάρτα έχει μεγάλη αβεβαιότητα. Πρόσθεσε λοξές λήψεις όπου φαίνεται καθαρά ολόκληρη η κάρτα.',
  NOT_POSITIVE: 'Οι γωνίες δεν δίνουν έγκυρη εστιακή. Ξανασημείωσε τις γωνίες και χρησιμοποίησε τον ίδιο φακό σε όλες τις λήψεις.',
  BAD_INPUT: 'Δεν διαβάστηκαν οι γωνίες ή οι διαστάσεις για την εστιακή. Ξανασημείωσε τέσσερις ξεχωριστές γωνίες σε κάθε λήψη.',
  FRAME_SIZE_MISMATCH: 'Χρειάζονται φωτογραφίες ίδιων διαστάσεων. Επιτρέπεται στροφή κατά 90°. Χρησιμοποίησε λήψεις χωρίς περικοπή.',
  SAME_LENS_REQUIRED: 'Επιβεβαίωσε ότι χρησιμοποίησες το ίδιο κινητό και τον ίδιο φακό 1×, χωρίς ζουμ ή περικοπή.',
  FOCAL_RADIUS_UNCERTAIN: 'Η αβεβαιότητα της εστιακής δεν επιτρέπει σταθερή ακτίνα. Πρόσθεσε πιο λοξές λήψεις από διαφορετικές πλευρές.',
  INVALID_EDGE: `Χρειάζονται τουλάχιστον οκτώ έγκυρα σημεία άκρης σε κάθε έτοιμη φωτογραφία. ${endOrderHelp}`,
  EDGE_END_ORDER: `Η αντιστοιχία των δύο άκρων δείχνει ότι η σειρά τους έχει αλλάξει. ${endOrderHelp}`,
  DUPLICATE_VIEW: 'Οι λήψεις έχουν ουσιαστικά την ίδια θέση και κατεύθυνση. Πρόσθεσε λοξές φωτογραφίες από διαφορετικές πλευρές.',
  STRAIGHT_EDGE: 'Η καμπυλότητα δεν ξεχωρίζει αρκετά από μια ευθεία. Σημείωσε μεγαλύτερο τμήμα της άκρης και πρόσθεσε λοξές λήψεις.',
  ARC_INITIAL_FAILED: `Δεν βρέθηκαν διακριτά άκρα και καμπύλη στον χώρο. ${endOrderHelp} Πρόσθεσε λοξές λήψεις.`,
  ARC_FIT_FAILED: `Οι σημειώσεις δεν έδωσαν έγκυρο τόξο. Έλεγξε ότι έχεις σημειώσει την ίδια γραμμή σε κάθε λήψη. ${endOrderHelp}`,
  ARC_UNCERTAINTY_FAILED: 'Το τυπικό σφάλμα δεν μπορεί να υπολογιστεί με αυτές τις λήψεις. Πρόσθεσε φωτογραφίες από πιο διαφορετικές γωνίες.',
  ARC_AMBIGUOUS: 'Οι σημειώσεις δίνουν πάνω από μία δυνατή ακτίνα. Πρόσθεσε λοξές λήψεις από διαφορετικές πλευρές.',
  CALCULATION_ERROR: 'Ο υπολογισμός διακόπηκε. Δοκίμασε ξανά με τουλάχιστον δύο έτοιμες φωτογραφίες.',
};

const warningText = {
  LOW_VIEW_SPREAD: 'Οι λήψεις έχουν μικρό άνοιγμα γωνιών. Πρόσθεσε λοξή λήψη από άλλη πλευρά.',
  ESTIMATOR_DISAGREEMENT: 'Ο κοινός εκτιμητής και η σάρωση δίνουν διαφορετικές ακτίνες.',
  LEAVE_ONE_OUT_CHANGE: 'Η κοινή ακτίνα αλλάζει αισθητά όταν αφαιρείται μία λήψη.',
  SCAN_FAILED: 'Η σάρωση δεν έδωσε ακτίνα.',
  ARC_AMBIGUOUS: 'Ο κοινός εκτιμητής βρήκε δεύτερη δυνατή ακτίνα με παρόμοιο σφάλμα.',
};

const scanText = {
  SCAN_CHORD_FAILED: 'Η σάρωση δεν μπόρεσε να βρει τη χορδή.',
  SCAN_MINIMUM_FAILED: 'Η σάρωση δεν βρήκε λύση που να προβάλλεται σε όλες τις λήψεις.',
  SCAN_AMBIGUOUS: 'Η σάρωση βρήκε διαφορετικές ακτίνες με παρόμοιο σφάλμα.',
};

export function refusalMessage(code) {
  return refusalText[code] ?? refusalText.CALCULATION_ERROR;
}

export function globalWarnings(result) {
  const warnings = (result.warningDetails ?? []).flatMap(({ view, code }) => {
    if (view !== null || !Object.hasOwn(warningText, code)) return [];
    const message = code === 'SCAN_FAILED' ? scanText[result.scan?.code] ?? warningText[code] : warningText[code];
    return [{ code, message }];
  });
  if (result.focal?.disagreement) {
    warnings.unshift({ code: 'FOCAL_DISAGREEMENT', message: 'Η εστιακή του αρχείου και της κάρτας δεν συμφωνούν' });
  }
  return warnings;
}

export function compareDiameter(radiusMm, knownDiameterMm) {
  if (knownDiameterMm === null) return null;
  const knownRadiusMm = knownDiameterMm / 2;
  const deltaMm = radiusMm - knownRadiusMm;
  const deltaPct = 100 * (deltaMm / knownRadiusMm);
  return { knownRadiusMm, deltaMm, deltaPct: Number.isFinite(deltaPct) ? deltaPct : null };
}

export function createSummary({ photos, included, cardConfirmed, sameLensConfirmed, knownDiameterMm, result }) {
  const indexById = new Map(included.map(({ photoId }, index) => [photoId, index]));
  const focal = result.focal ?? null;
  const outputPhotos = photos.map(photo => {
    const { id, width, height, focal35Mm, cornersPx, edgePx } = photo;
    const index = indexById.get(id);
    const fileFocalPx = focal35ToPixels(focal35Mm, width, height);
    const focalPx = focal?.source === 'card' ? focal.card?.focalPx ?? null : fileFocalPx;
    return {
      id, label: `Φωτογραφία ${id}`, status: photoStatusLabel(photo), included: index !== undefined,
      width, height, focal35Mm, fileFocalPx, focalPx: index === undefined ? null : focalPx,
      cx: width === null ? null : width / 2, cy: height === null ? null : height / 2,
      cornersPx, edgePx,
      diagnostics: result.ok && index !== undefined ? result.views[index] : null,
      radiusWithoutPhotoMm: result.ok && index !== undefined ? result.leaveOneOut?.radiiMm[index] ?? null : null,
    };
  });
  const { ok, code } = result;
  const output = ok ? {
    ok, code,
    radiusMm: result.radiusMm,
    radiusSigmaMm: result.radiusSigmaMm,
    totalRadiusSigmaMm: result.totalRadiusSigmaMm,
    focalRadiusSigmaMm: result.focalRadiusSigmaMm ?? null,
    radiusAtHigherFocalMm: result.radiusAtHigherFocalMm ?? null,
    radiusAtLowerFocalMm: result.radiusAtLowerFocalMm ?? null,
    chordMm: result.chordMm,
    sagittaMm: result.sagittaMm,
    sagittaSigmaMm: result.sagittaSigmaMm,
    arcLengthMm: result.arcLengthMm,
    edgeRmsPx: result.edgeRmsPx,
    viewSpreadDeg: result.viewSpreadDeg,
    alternativeRadiusMm: result.alternativeRadiusMm,
    scan: result.scan?.ok ? result.scan : { ok: false, code: result.scan?.code },
    disagreementPct: result.disagreementPct,
    leaveOneOutMaxChangePct: result.leaveOneOut?.maxChangePct ?? null,
    comparison: compareDiameter(result.radiusMm, knownDiameterMm),
  } : { ok, code, message: refusalMessage(code) };
  output.warnings = globalWarnings(result);
  output.coreWarningDetails = result.warningDetails ?? [];
  return JSON.stringify({
    provenance: PROVENANCE,
    pageVersion: PAGE_VERSION,
    coreVersion: CORE_VERSION,
    cardFocalVersion: CARD_FOCAL_VERSION,
    cardConfirmed, sameLensConfirmed, knownDiameterMm, options: MEASUREMENT_OPTIONS,
    focal, cardOrder: result.cardOrder ?? { ok: null, reason: focal?.source === 'exif' ? 'file_focal' : 'not_checked' },
    photos: outputPhotos, result: output,
  }, null, 2);
}
