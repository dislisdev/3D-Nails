// Πειραματικό · Οδηγός λήψης 0.1.1 · σύγκριση διαθέσιμων ενδείξεων κατά τη λήψη.
import { sameFrameSize } from './bench/views.mjs';

function different(values) {
  return new Set(values.filter(value => value != null && value !== '')).size > 1;
}

export function trackIssue(cameras) {
  if (cameras.some(camera => Number.isFinite(camera?.settings?.zoom) && camera.settings.zoom !== 1)) return 'FAN_ZOOM';
  const frames = cameras.map(camera => camera?.settings).filter(s => s?.width > 0 && s.height > 0);
  if (!sameFrameSize(frames)) return 'FRAME_SIZE_MISMATCH';
  if (different(cameras.map(c => c?.selectedId)) || different(cameras.map(c => c?.label))
      || different(cameras.map(c => c?.settings?.resizeMode))) return 'FAN_SOURCE_CHANGED';
  return null;
}

export function fanCameraIssue(shots) {
  if (!sameFrameSize(shots)) return 'FRAME_SIZE_MISMATCH';
  if (different(shots.map(s => s.method))) return 'FAN_METHOD_CHANGED';
  if (different(shots.map(s => s.focal35Mm)) || different(shots.map(s => s.focalLengthMm))) return 'FAN_SOURCE_CHANGED';
  return trackIssue(shots.map(s => s.camera));
}

export const FAN_ISSUE_TEXT = {
  FRAME_SIZE_MISMATCH: 'Άλλαξαν οι διαστάσεις της εικόνας. Γύρνα στην αρχική ανάλυση ή ξεκίνα ξανά τη βεντάλια.',
  FAN_ZOOM: 'Η κάμερα δηλώνει μεγέθυνση. Γύρνα στο 1× ή διάλεξε απλή πίσω κάμερα και ξαναβγάλε τη λήψη.',
  FAN_SOURCE_CHANGED: 'Άλλαξε η κάμερα, ο φακός ή η περικοπή. Διάλεξε την ίδια πίσω κάμερα ή ξεκίνα ξανά τη βεντάλια.',
  FAN_METHOD_CHANGED: 'Άλλαξε ο τρόπος λήψης. Συνέχισε με τον αρχικό τρόπο ή ξεκίνα ξανά τη βεντάλια.',
};
