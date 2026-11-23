// Πειραματικό · Οδηγός λήψης 0.1.1 · προβολή των λήψεων και της σύνοψης πάγκου.
import { setGuideInputs } from './bench/bench.mjs';
import { shotsFor } from './guide-model.mjs';
import { makeThumbnail, shotLabel } from './photo-views.mjs';
import { buildGuideSummary, fanQuality } from './summary.mjs';
import { RESULT_TEXT } from './texts.mjs';

const display = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1, useGrouping: false });
const angle = degrees => display.format(degrees) + '°';

export function mountMeasurement({ document, guide, zoom, userAgent }) {
  const { state } = guide;
  const byId = id => document.getElementById(id);
  const otherViews = byId('other-views');
  const quality = byId('fan-quality');
  const warning = byId('rounded-warning');
  warning.textContent = RESULT_TEXT.rounded;
  let used = false;
  let previousOther = [];
  const wrapSummary = benchText => JSON.stringify(buildGuideSummary({ state, benchText, userAgent }), null, 2);

  function renderOtherViews() {
    const shots = [...shotsFor(state, 3), ...shotsFor(state, 5)];
    if (shots.length === previousOther.length && shots.every((shot, index) => shot === previousOther[index])) return;
    previousOther = shots;
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = RESULT_TEXT.otherViews;
    const cards = document.createElement('div');
    cards.className = 'photo-grid';
    for (const shot of shots) {
      const card = document.createElement('figure');
      card.className = 'review-card stack';
      const caption = document.createElement('figcaption');
      caption.textContent = shotLabel(shot);
      card.append(makeThumbnail(document, shot, zoom), caption);
      cards.append(card);
    }
    otherViews.replaceChildren(hint, cards);
  }

  return () => {
    const visible = state.step === 7;
    if (!used && !visible) return;
    used = true;
    if (visible) {
      renderOtherViews();
      const fan = fanQuality(state);
      const elevation = fan.minElevationDeg === null ? 'χωρίς ένδειξη ανύψωσης'
        : 'ανύψωση ' + angle(fan.minElevationDeg) + ' έως ' + angle(fan.maxElevationDeg);
      const turn = fan.maxSideTurnDeg === null ? 'χωρίς ένδειξη στροφής'
        : 'μέγιστη στροφή στο πλάι ' + angle(fan.maxSideTurnDeg) + ' (ενδεικτική)';
      const notes = ['Βεντάλια · ' + fan.captures + ' λήψεις · ' + elevation + ' · ' + turn];
      if (fan.elevationsMeasured > 0 && fan.elevationsMeasured < fan.captures) notes.push('Με ένδειξη γωνίας ' + fan.elevationsMeasured + ' από ' + fan.captures + '.');
      if (fan.turnsMeasured > 0 && fan.turnsMeasured < fan.captures - 1) notes.push('Με συγκρίσιμη στροφή ' + fan.turnsMeasured + ' από ' + (fan.captures - 1) + '.');
      if (fan.outsideElevationTarget) notes.push('Έξω από τη ζώνη ανύψωσης ' + fan.outsideElevationTarget + '.');
      if (fan.outsideTurnTarget) notes.push('Με μεγάλη στροφή στο πλάι ' + fan.outsideTurnTarget + '.');
      if (fan.moved) notes.push('Με κούνημα ' + fan.moved + '.');
      if (fan.outsideElevationTarget || fan.outsideTurnTarget || fan.moved) notes.push('Γύρνα στον έλεγχο για επανάληψη.');
      quality.textContent = notes.join(' ');
      warning.hidden = state.subject !== 'nail' || state.edge === 'straight';
    } else if (previousOther.length) {
      previousOther = [];
      otherViews.replaceChildren();
    }
    void setGuideInputs({
      shots: shotsFor(state, 4), diameterText: state.diameterText, visible, wrapSummary,
    });
  };
}
