import { compareDiameter, globalWarnings, PROVENANCE, refusalMessage } from './readout.mjs';

const number = new Intl.NumberFormat('el-GR', { maximumSignificantDigits: 6, useGrouping: false });
const focalPixels = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0, useGrouping: 'always' });
const focalPercent = new Intl.NumberFormat('el-GR', { style: 'percent', maximumSignificantDigits: 2 });
const value = (amount, unit = '') => Number.isFinite(amount) ? `${number.format(amount)}${unit}` : 'Δεν δίνεται';

function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function values(rows) {
  const grid = element('dl', '', 'value-grid');
  for (const [label, content] of rows) {
    const term = element('div');
    term.append(element('dt', label), element('dd', content, 'numeric'));
    grid.append(term);
  }
  return grid;
}

function sequence(values) {
  return values.map(item => value(item)).join(' · ');
}

function diagnostics(result, included) {
  const table = element('table', '', 'diagnostics');
  table.setAttribute('aria-label', 'Αριθμοί ανά φωτογραφία');
  const heading = table.createTHead().insertRow();
  for (const text of ['Φωτογραφία', 'Αριθμοί προσαρμογής']) {
    const header = element('th', text);
    header.scope = 'col';
    heading.append(header);
  }
  const body = table.createTBody();
  for (const [i, data] of result.views.entries()) {
    const row = body.insertRow();
    const label = element('th', `Φωτογραφία ${included[i].photoId}`);
    label.scope = 'row';
    row.append(label);
    const content = row.insertCell();
    content.append(values([
      ['Σφάλμα κάρτας (px)', value(data.cardRmsPx)],
      ['Σφάλμα άκρης (px)', value(data.edgeRmsPx)],
      ['Απόσταση άκρου Α (px)', value(data.endMissPx[0])],
      ['Απόσταση άκρου Β (px)', value(data.endMissPx[1])],
    ]));
    const extra = element('details');
    const extraValues = [
      ['Μέση απόκλιση άκρης (px)', value(data.bow.meanPx)],
      ['Ομαλή απόκλιση (px)', value(data.bow.rmsPx)],
      ['Όρος συνημιτόνου (px)', value(data.bow.cosPx)],
      ['Όρος ημιτόνου (px)', value(data.bow.sinPx)],
      ['Κέντρο κάμερας (mm)', sequence(data.centerMm)],
      ['Στροφή κάμερας', sequence(data.rotation)],
      ['Αποκλίσεις σημείων (px)', sequence(data.residualsPx)],
      ['Θέσεις κατά μήκος του τόξου', sequence(data.phase)],
    ];
    if (result.leaveOneOut !== null) {
      extraValues.push(['Κοινή ακτίνα χωρίς τη φωτογραφία (mm)', value(result.leaveOneOut.radiiMm[i])]);
    }
    extra.append(element('summary', 'Περισσότεροι αριθμοί'), values(extraValues));
    content.append(extra);
  }
  return table;
}

function focalLabel(result) {
  const { focal } = result;
  if (focal?.source === 'exif') return 'Εστιακή από το αρχείο';
  if (focal?.source !== 'card') return '';
  if (!result.ok) return 'Εστιακή από την κάρτα';
  const { focalPx, focalSigmaRel } = focal.card;
  return `Εστιακή από την κάρτα: ${focalPixels.format(focalPx)} px ± ${focalPercent.format(focalSigmaRel)}`;
}

function appendWarnings(details, result) {
  const warnings = globalWarnings(result);
  if (warnings.length === 0) return;
  const list = element('ul', '', 'warnings');
  list.append(...warnings.map(({ message }) => element('li', message)));
  details.append(element('h3', 'Προειδοποιήσεις μέτρησης'), list);
}

export function renderResult(details, result, included, knownDiameterMm) {
  const provenance = element('p', PROVENANCE, 'edition');
  const source = focalLabel(result);
  if (!result.ok) {
    details.replaceChildren(provenance, element('p', refusalMessage(result.code), 'notice'));
    const estimate = result.focal?.card;
    if (estimate?.ok === false && estimate.code !== result.code) {
      details.append(element('p', refusalMessage(estimate.code), 'hint'));
    }
    if (source) details.append(element('p', source, 'hint'));
    appendWarnings(details, result);
    return;
  }

  const radius = element('p', `${value(result.radiusMm)} ± ${value(result.totalRadiusSigmaMm, ' mm')}`, 'radius-result');
  const errorLabel = result.focal?.source === 'card'
    ? 'Τυπικό σφάλμα μαζί με την αβεβαιότητα της εστιακής.'
    : 'Τυπικό σφάλμα της προσαρμογής με τις υπολογισμένες θέσεις κάμερας.';
  const readings = [
    ['Χορδή', value(result.chordMm, ' mm')],
    ['Βέλος', value(result.sagittaMm, ' mm')],
    ['Κοινός εκτιμητής', value(result.radiusMm, ' mm')],
    ['Σάρωση', result.scan?.ok ? value(result.scan.radiusMm, ' mm') : 'Δεν έδωσε ακτίνα'],
    ['Διαφορά εκτιμητών', value(result.disagreementPct, '%')],
  ];
  if (result.alternativeRadiusMm !== null) {
    readings.push(['Δεύτερη λύση του κοινού εκτιμητή', value(result.alternativeRadiusMm, ' mm')]);
  }
  const comparison = compareDiameter(result.radiusMm, knownDiameterMm);
  if (comparison) {
    readings.push(
      ['Γνωστή ακτίνα από παχύμετρο', value(comparison.knownRadiusMm, ' mm')],
      ['Διαφορά από τη γνωστή ακτίνα', `${value(comparison.deltaMm, ' mm')} · ${value(comparison.deltaPct, '%')}`],
    );
  }
  details.replaceChildren(
    provenance,
    element('h3', 'Μετρημένη ακτίνα'),
    radius,
    element('p', errorLabel, 'hint'),
  );
  if (source) details.append(element('p', source, 'hint'));
  details.append(values(readings));
  appendWarnings(details, result);
  details.append(element('h3', 'Αριθμοί ανά φωτογραφία'), diagnostics(result, included));
}
