// Πειραματικό · μεταφορά των δηλώσεων της φόρμας · WebApp 0.2.0.
import { COIN_ASSUMPTIONS, COIN_SOURCE, INPUT_MESSAGES, MeasurementInputError, coinById } from '../core/catalog.mjs';
import { outlineEdge, parseDecimal, pickedRegion } from './model.mjs';

const geometryNames = ['cameraDistance', 'cameraUncertainty', 'referenceHeight',
  'referenceHeightUncertainty', 'contourHeight', 'contourHeightUncertainty'];
export const measurementFields = {
  provenance: 'generatorVersion', diameter: 'diameter', 'uncertainty-mm': 'referenceUncertaintyMm',
  'uncertainty-px': 'referenceUncertaintyPx', source: 'referenceSource', reference: 'referenceId',
  'reference-center': 'referenceX', 'target-center': 'targetX', target: 'targetId',
  arc: 'arcStart', geometry: 'cameraDistance', control: 'controlStartX', 'control-mismatch': 'controlLength',
  'control-independent': 'controlStartX', 'evaluation-coins': 'targetCoinId',
};
export function sourceFrom(form) {
  if (form.provenance === 'object') return { provenance: 'αντικείμενο' };
  const name = form.generatorId.trim(), version = form.generatorVersion.trim();
  if (!name || name.length > 128 || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    throw new MeasurementInputError('provenance', INPUT_MESSAGES.provenance);
  }
  return { provenance: 'συνθετικό', generator: { generator_id: name, generator_version: version } };
}

export function formPoint(form, x, y) {
  return form[x] === '' && form[y] === '' ? undefined : [parseDecimal(form[x]), parseDecimal(form[y])];
}

function outline(form, prefix, knownThickness) {
  const edge = outlineEdge(form, prefix + 'Edge');
  return {
    edge,
    center: formPoint(form, prefix + 'X', prefix + 'Y'),
    thickness: form[prefix + 'Thickness'] === '' ? knownThickness ?? null : parseDecimal(form[prefix + 'Thickness']),
  };
}

export function inputFrom(state) {
  const { form } = state;
  const source = sourceFrom(form);
  const evaluation = form.purpose === 'evaluation';
  const fromCoin = evaluation || form.dimensionKind === 'coin';
  const coin = fromCoin ? coinById(form.coinId) : null;
  const declaration = form.referenceSource.trim();
  if (fromCoin && !coin) throw new MeasurementInputError('coin', 'Διάλεξε το κέρμα που φαίνεται στην αναφορά.');
  const assumed = [
    form.referenceUncertaintyMm.trim() ? null : 'γνωστής διαμέτρου',
    form.referenceUncertaintyPx.trim() ? null : 'διαμέτρου στην εικόνα',
  ].filter(Boolean);
  const sourceParts = coin ? [COIN_SOURCE, coin.label, 'Ονομαστική διάμετρος από τον κατάλογο της ΕΚΤ'] : [];
  if (coin && assumed.length) {
    sourceParts.push('Αβεβαιότητες (' + assumed.join(', ') + ') από υπόθεση της εφαρμογής, δεν μετρήθηκαν');
  }
  if (declaration) sourceParts.push('Χειροκίνητη δήλωση ' + declaration);
  else if (coin && assumed.length < 2) sourceParts.push('Οι τιμές που άλλαξαν δηλώθηκαν από τον χρήστη');
  const dimension = {
    diameter: coin?.diameter ?? parseDecimal(form.diameter),
    uncertaintyMm: parseDecimal(form.referenceUncertaintyMm) ?? (coin ? COIN_ASSUMPTIONS.uncertaintyMm : null),
    uncertaintyPx: parseDecimal(form.referenceUncertaintyPx) ?? (coin ? COIN_ASSUMPTIONS.uncertaintyPx : null),
    source: sourceParts.join(' · '),
  };
  const referenceOutline = outline(form, 'reference', coin?.thickness);
  if (evaluation && source.provenance === 'αντικείμενο' && referenceOutline.edge !== 'upper_rim' && !referenceOutline.center) {
    throw new MeasurementInputError('reference-center', INPUT_MESSAGES.referenceCenter);
  }
  const targetCoin = evaluation ? coinById(form.targetCoinId) : null;
  const control = evaluation ? {
    kind: form.controlKind, lengthMm: parseDecimal(form.controlLength),
    uncertaintyMm: parseDecimal(form.controlUncertaintyMm), uncertaintyPx: parseDecimal(form.controlUncertaintyPx),
    source: form.controlSource.trim(),
    endpoints: [formPoint(form, 'controlStartX', 'controlStartY'), formPoint(form, 'controlEndX', 'controlEndY')],
  } : null;
  const geometry = Object.fromEntries(geometryNames.map(name => [name, parseDecimal(form[name])]));
  return {
    image: state.image.info, source, purpose: form.purpose, control,
    referenceRegion: pickedRegion(state, 'referenceId'), targetRegion: pickedRegion(state, 'targetId'),
    referenceDimension: dimension, referenceOutline,
    targetOutline: outline(form, 'target', targetCoin?.thickness), geometry,
  };
}

export function selectionFrom(form) {
  return {
    anchorFraction: Number(form.anchorPercent) / 100,
    mode: form.selectionMode, startFraction: Number(form.arcStart) / 100, endFraction: Number(form.arcEnd) / 100,
    materialInside: form.materialInside,
  };
}

export function checkEvaluationChoices(state, input) {
  if (!coinById(state.form.targetCoinId) || state.form.targetCoinId === state.form.coinId) {
    throw new MeasurementInputError('evaluation-coins', 'Διάλεξε για μέτρηση κέρμα διαφορετικής αξίας από το κέρμα αναφοράς.');
  }
  if (input.source.provenance === 'αντικείμενο' && !input.targetOutline.center) {
    throw new MeasurementInputError('target-center', INPUT_MESSAGES.targetCenter);
  }
}
