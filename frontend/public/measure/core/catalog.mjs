export const APP_NAME = 'Μέτρηση καμπυλότητας';
export const APP_VERSION = '0.2.0';
export const MATURITY = 'Πειραματικό';
export const FORMAT_VERSION = '0.3';
export const INTERFACE_VERSION = '0.4';
export const DEMO_GENERATOR = { generator_id: 'y3c-dev-shapes', generator_version: '0.1.0' };
export const INPUT_MESSAGES = {
  provenance: 'Δώσε το όνομα και την έκδοση της γεννήτριας της τεχνητής εικόνας.',
  target: 'Διάλεξε αντικείμενο μέτρησης με διαφορετικό περίγραμμα από την αναφορά.',
  referenceCenter: 'Σημείωσε στην εικόνα το κέντρο της άνω όψης της αναφοράς.',
  targetCenter: 'Σημείωσε στην εικόνα το κέντρο της άνω όψης του αντικειμένου που μετράς.',
};
export const COIN_SOURCE = 'Ευρωπαϊκή Κεντρική Τράπεζα · Κέρματα ευρώ, Common sides · στοιχεία πακέτου Υ3γ';
// Η ΕΚΤ δίνει ονομαστική διάμετρο, χωρίς ανοχή ή φθορά. Ο έλεγχος Υ3β Ν-6
// έδειξε καλύτερη κάλυψη για το όριο εικόνας των 0,5 pixel έναντι των 0,15.
export const COIN_ASSUMPTIONS = Object.freeze({ uncertaintyMm: 0.1, uncertaintyPx: 0.5 });
export const COINS = [
  { id: '1c', label: '1 λεπτό', diameter: 16.25, thickness: 1.67 },
  { id: '2c', label: '2 λεπτά', diameter: 18.75, thickness: 1.67 },
  { id: '5c', label: '5 λεπτά', diameter: 21.25, thickness: 1.67 },
  { id: '10c', label: '10 λεπτά', diameter: 19.75, thickness: 1.93 },
  { id: '20c', label: '20 λεπτά', diameter: 22.25, thickness: 2.14, note: 'Περιφέρεια με εγκοπές' },
  { id: '50c', label: '50 λεπτά', diameter: 24.25, thickness: 2.38 },
  { id: '1e', label: '1 ευρώ', diameter: 23.25, thickness: 2.33 },
  { id: '2e', label: '2 ευρώ', diameter: 25.75, thickness: 2.20 },
];
export const coinById = id => COINS.find(coin => coin.id === id);

export class MeasurementInputError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
