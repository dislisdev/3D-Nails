// Πειραματικό · Οδηγός λήψης 0.1.0 · έλεγχος λήψεων της σελίδας.
import { shotsFor } from './guide-model.mjs';
import { makeThumbnail, shotLabel } from './photo-views.mjs';
import { possiblySoft } from './sharpness-check.mjs';
import { CAPTURE_TEXT } from './texts.mjs';

const labels = ['Από πάνω', 'Βεντάλια', 'Από το πλάι'];
const degrees = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1, useGrouping: false });

export function mountReview({ document, guide, zoom }) {
  const { state } = guide;
  const gallery = document.getElementById('review-photos');
  let previous = [];

  function card(shot) {
    const figure = document.createElement('figure');
    figure.className = 'review-card stack';
    const title = document.createElement('figcaption');
    title.textContent = 'Λήψη ' + shot.number;
    const angle = document.createElement('p');
    angle.className = 'hint';
    angle.textContent = Number.isFinite(shot.elevationAtPress)
      ? 'Ανύψωση ' + degrees.format(shot.elevationAtPress) + '°'
      : 'Χωρίς ένδειξη γωνίας';
    figure.append(makeThumbnail(document, shot, zoom));
    if (shot.step === 'fan') figure.append(title);
    figure.append(angle);
    const warnings = [shot.moved && CAPTURE_TEXT.moved, possiblySoft(shot.sharpnessScore) && CAPTURE_TEXT.soft].filter(Boolean);
    for (const message of warnings) {
      const warning = document.createElement('p');
      warning.className = 'photo-warning';
      warning.textContent = message;
      figure.append(warning);
    }
    const retake = document.createElement('button');
    retake.type = 'button';
    retake.textContent = 'Ξαναβγάλε';
    retake.setAttribute('aria-label', 'Ξαναβγάλε τη φωτογραφία «' + shotLabel(shot) + '»');
    retake.addEventListener('click', () => {
      if (guide.retake(shot.id) && state.cameraMode !== 'file') {
        void guide.openCamera(shot.camera?.selectedId ?? state.cameraInfo?.selectedId);
      }
    });
    figure.append(retake);
    return figure;
  }

  return () => {
    if (state.step !== 6) {
      if (previous.length) gallery.replaceChildren();
      previous = [];
      return;
    }
    const groups = [3, 4, 5].map(step => shotsFor(state, step));
    const shots = groups.flat();
    if (shots.length === previous.length && shots.every((shot, index) => shot === previous[index])) return;
    previous = shots;
    gallery.replaceChildren(...groups.map((group, index) => {
      const block = document.createElement('div');
      block.className = 'review-group stack';
      const heading = document.createElement('h3');
      heading.textContent = labels[index];
      const grid = document.createElement('div');
      grid.className = 'photo-grid';
      grid.append(...group.map(card));
      block.append(heading, grid);
      return block;
    }));
  };
}
