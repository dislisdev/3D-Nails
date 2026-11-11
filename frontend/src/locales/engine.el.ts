/** Greek presentation strings only. Stored research keys and export schemas stay English. */
export const engineEl: Record<string, string> = {
  // Interactive geometry viewer.
  "ACTUAL EXPORTED GEOMETRY": "Η ΓΕΩΜΕΤΡΙΑ ΤΩΝ ΕΞΑΓΩΓΩΝ",
  "YOUR MODEL, AFTER REVIEW": "ΤΟ ΜΟΝΤΕΛΟ ΣΑΣ, ΜΕΤΑ ΤΟΝ ΕΛΕΓΧΟ",
  "A form of your own.": "Η δική σας μορφή.",
  "Complete calibration and review your parameters to generate an inspectable laboratory model.":
    "Ολοκληρώστε τη βαθμονόμηση και ελέγξτε τις παραμέτρους για να δημιουργήσετε ένα εργαστηριακό μοντέλο προς επιθεώρηση.",
  "Interactive three dimensional nail shell. Drag to rotate, pinch or scroll to zoom; right drag to pan.":
    "Διαδραστικό τρισδιάστατο κέλυφος νυχιού. Σύρετε για περιστροφή, χρησιμοποιήστε δύο δάχτυλα ή κύλιση για μεγέθυνση και δεξί σύρσιμο για μετατόπιση.",
  "Interactive three dimensional nail shell, showing the same faceted mesh used for STL and STEP export. Drag to rotate, pinch or scroll to zoom; right drag to pan.":
    "Διαδραστικό τρισδιάστατο κέλυφος νυχιού με το ίδιο τριγωνικό πλέγμα που εξάγεται σε STL και STEP. Σύρετε για περιστροφή, χρησιμοποιήστε δύο δάχτυλα ή κύλιση για μεγέθυνση και δεξί σύρσιμο για μετατόπιση.",
  "WebGL is unavailable. CAD downloads and the validation report remain available.":
    "Το WebGL δεν είναι διαθέσιμο. Μπορείτε να κατεβάσετε τα αρχεία CAD και την αναφορά ελέγχου.",
  Top: "Κάτοψη",
  Underside: "Κάτω όψη",
  Front: "Πρόσοψη",
  Side: "Πλάγια όψη",
  Oblique: "Λοξή όψη",
  top: "Κάτοψη",
  below: "Κάτω όψη",
  front: "Πρόσοψη",
  side: "Πλάγια όψη",
  oblique: "Λοξή όψη",
  "Reset 3D view": "Επαναφορά τρισδιάστατης όψης",
  Landmarks: "Σημεία αναφοράς",
  "Reference axes": "Άξονες αναφοράς",
  Axes: "Άξονες",
  Mesh: "Πλέγμα",
  "Hide baseline": "Απόκρυψη αρχικής έκδοσης",
  "Compare baseline": "Σύγκριση με αρχική έκδοση",
  "Landmarks are parametric model locations · not recovered anatomy":
    "Παραμετρικά σημεία μοντέλου · δεν αποτελούν ανατομική ανακατασκευή",
  "Axes: X transverse · Y length · Z height · units mm":
    "Άξονες: X εγκάρσια · Y κατά μήκος · Z ύψος · μονάδες mm",
  "Drag to orbit · scroll to zoom · right-drag to pan":
    "Σύρετε για περιστροφή · κύλιση για μεγέθυνση · δεξί σύρσιμο για μετατόπιση",

  // Measurement provenance and research states. These are display mappings.
  measured: "Μετρημένη τιμή",
  Measured: "Μετρημένη τιμή",
  estimated: "Εκτίμηση",
  Estimated: "Εκτίμηση",
  manually_adjusted: "Χειροκίνητη προσαρμογή",
  "Manually adjusted": "Χειροκίνητη προσαρμογή",
  manual: "Χειροκίνητος ορισμός",
  Manual: "Χειροκίνητος ορισμός",
  unknown: "Άγνωστο",
  Unknown: "Άγνωστο",
  unavailable: "Μη διαθέσιμο",
  Unavailable: "Μη διαθέσιμο",
  manual_control_points: "Χειροκίνητα σημεία περιγράμματος",
  calibrated_photo: "Βαθμονομημένη φωτογραφική μέτρηση",
  heuristic_only: "Μόνο ενδεικτικός έλεγχος",
  manual_review_required: "Απαιτείται ανθρώπινος έλεγχος",
  private_browser_indexeddb: "Ιδιωτική αποθήκευση σε αυτόν τον περιηγητή",
  draft: "Πρόχειρο",
  Draft: "Πρόχειρο",
  measurement_review_needed: "Απαιτείται έλεγχος μέτρησης",
  "Measurement review needed": "Απαιτείται έλεγχος μέτρησης",
  geometrically_reviewed: "Έγινε γεωμετρικός έλεγχος",
  "Geometrically reviewed": "Έγινε γεωμετρικός έλεγχος",
  lab_print_requested: "Ζητήθηκε εργαστηριακή εκτύπωση",
  "Lab print requested": "Ζητήθηκε εργαστηριακή εκτύπωση",
  printed: "Εκτυπώθηκε",
  Printed: "Εκτυπώθηκε",
  evaluated_on_reference_model: "Αξιολογήθηκε σε ομοίωμα αναφοράς",
  "Evaluated on reference model": "Αξιολογήθηκε σε ομοίωμα αναφοράς",
  accepted: "Αποδεκτή λήψη",
  rejected: "Απορριφθείσα λήψη",
  created: "Δημιουργία συνεδρίας",
  capture: "Λήψη φωτογραφίας",
  measurement: "Μέτρηση",
  review: "Έλεγχος",
  annotation: "Σημείωση φωτογραφίας",
  experiment: "Πείραμα",
  deletion: "Διαγραφή",
  cad: "Δημιουργία γεωμετρίας",
  cad_failure: "Αποτυχία δημιουργίας γεωμετρίας",
  cuticle: "Εγγύς όριο",
  distal: "Άπω όριο",
  left_sidewall: "Αριστερό πλαϊνό όριο",
  right_sidewall: "Δεξί πλαϊνό όριο",

  // Browser storage, ownership and request failures.
  "Browser storage is full. Delete older local sessions or free storage and retry. No research data was uploaded.":
    "Ο αποθηκευτικός χώρος του περιηγητή γέμισε. Διαγράψτε παλαιότερες τοπικές συνεδρίες ή ελευθερώστε χώρο και δοκιμάστε ξανά. Δεν μεταφορτώθηκαν ερευνητικά δεδομένα.",
  "Private browser storage is unavailable. Allow site storage or use a normal browser window. Photos cannot be saved until storage works.":
    "Η ιδιωτική αποθήκευση του περιηγητή δεν είναι διαθέσιμη. Επιτρέψτε την αποθήκευση για τον ιστότοπο ή ανοίξτε κανονικό παράθυρο περιήγησης. Οι φωτογραφίες δεν μπορούν να αποθηκευτούν έως ότου αποκατασταθεί η λειτουργία.",
  "The local research record could not be saved. Check browser storage and retry.":
    "Η τοπική ερευνητική καταγραφή δεν αποθηκεύτηκε. Ελέγξτε τον χώρο αποθήκευσης του περιηγητή και δοκιμάστε ξανά.",
  "This browser does not support IndexedDB research storage. Use a current Safari, Chrome, Firefox, or Edge browser.":
    "Αυτός ο περιηγητής δεν υποστηρίζει αποθήκευση ερευνητικών δεδομένων με IndexedDB. Χρησιμοποιήστε ενημερωμένο Safari, Chrome, Firefox ή Edge.",
  "Local storage is locked by another NAILFORM LAB tab. Close that tab and reload this one.":
    "Η τοπική αποθήκευση χρησιμοποιείται από άλλη καρτέλα του NAILFORM LAB. Κλείστε την άλλη καρτέλα και ανανεώστε αυτήν.",
  "This session changed in another tab. Reopen the session and retry so those changes are preserved.":
    "Η συνεδρία άλλαξε σε άλλη καρτέλα. Ανοίξτε την ξανά και επαναλάβετε την ενέργεια ώστε να διατηρηθούν οι αλλαγές.",
  "Research session not found in this browser. Sessions do not sync across devices or browsers.":
    "Η ερευνητική συνεδρία δεν βρέθηκε σε αυτόν τον περιηγητή. Οι συνεδρίες δεν συγχρονίζονται μεταξύ συσκευών ή περιηγητών.",
  "Research session not found in this browser workspace.":
    "Η ερευνητική συνεδρία δεν βρέθηκε στον χώρο εργασίας αυτού του περιηγητή.",
  "Image not found in this research session.":
    "Η εικόνα δεν βρέθηκε σε αυτήν την ερευνητική συνεδρία.",
  "Image not found in this session.":
    "Η εικόνα δεν βρέθηκε σε αυτήν τη συνεδρία.",
  "Model not found in this research session.":
    "Το μοντέλο δεν βρέθηκε σε αυτήν την ερευνητική συνεδρία.",
  "Model not found in this session.":
    "Το μοντέλο δεν βρέθηκε σε αυτήν τη συνεδρία.",
  "The model is unavailable in browser storage. Generate it again from the saved measurement.":
    "Το μοντέλο δεν είναι διαθέσιμο στην αποθήκευση του περιηγητή. Δημιουργήστε το ξανά από την αποθηκευμένη μέτρηση.",
  "Stored image is unavailable.": "Η αποθηκευμένη εικόνα δεν είναι διαθέσιμη.",
  "Stored model is unavailable.":
    "Το αποθηκευμένο μοντέλο δεν είναι διαθέσιμο.",
  "Stored export is unavailable.":
    "Το αποθηκευμένο αρχείο εξαγωγής δεν είναι διαθέσιμο.",
  "The request contains an unsupported field.":
    "Το αίτημα περιέχει πεδίο που δεν υποστηρίζεται.",
  "A JSON request body is required.":
    "Απαιτούνται δεδομένα αιτήματος σε μορφή JSON.",
  "The request body is not valid JSON.":
    "Τα δεδομένα του αιτήματος δεν είναι έγκυρο JSON.",
  "Feedback supports at most thirty issues.":
    "Μπορείτε να καταγράψετε έως τριάντα παρατηρήσεις προβλημάτων.",
  "A session supports at most one hundred photo annotations.":
    "Μια συνεδρία υποστηρίζει έως εκατό σημειώσεις φωτογραφιών.",
  "Annotation identifiers must be unique within the session.":
    "Κάθε σημείωση πρέπει να έχει μοναδικό αναγνωριστικό μέσα στη συνεδρία.",
  "Only local research routes are supported.":
    "Υποστηρίζονται μόνο τοπικές ερευνητικές λειτουργίες.",
  "The research route is invalid.":
    "Η διεύθυνση της ερευνητικής λειτουργίας δεν είναι έγκυρη.",
  "This research operation is unavailable.":
    "Αυτή η ερευνητική λειτουργία δεν είναι διαθέσιμη.",
  "Consent to storing research photographs on this device is required.":
    "Απαιτείται συγκατάθεση για την αποθήκευση ερευνητικών φωτογραφιών σε αυτήν τη συσκευή.",
  "Give the research session a name.":
    "Δώστε ένα όνομα στην ερευνητική συνεδρία.",
  "Measure and review a contour before accepting it.":
    "Μετρήστε και ελέγξτε το περίγραμμα πριν το αποδεχτείτε.",
  "Generate and inspect a model before accepting its geometry.":
    "Δημιουργήστε και επιθεωρήστε ένα μοντέλο πριν αποδεχτείτε τη γεωμετρία του.",
  "Geometric review also requires acceptance of the source contour.":
    "Ο γεωμετρικός έλεγχος απαιτεί επίσης αποδοχή του αρχικού περιγράμματος.",
  "The selected research state is unsupported.":
    "Η επιλεγμένη κατάσταση έρευνας δεν υποστηρίζεται.",
  "This state requires a current generated model and recorded geometric review.":
    "Αυτή η κατάσταση απαιτεί μοντέλο από την τρέχουσα μέτρηση και καταγεγραμμένο γεωμετρικό έλεγχο.",
  "Choose top, front, side, or oblique capture view.":
    "Επιλέξτε κάτοψη, πρόσοψη, πλάγια ή λοξή όψη λήψης.",
  "Choose an image file to upload.": "Επιλέξτε ένα αρχείο εικόνας.",
  "Choose an STL, STEP, parameter JSON, or validation report export.":
    "Επιλέξτε εξαγωγή STL, STEP, παραμέτρων JSON ή αναφοράς ελέγχου.",

  // Image decoding and quality warnings. These heuristics do not validate measurement.
  "Choose a valid JPEG, PNG, or WebP photograph. Export HEIC images to JPEG first.":
    "Επιλέξτε έγκυρη φωτογραφία JPEG, PNG ή WebP. Μετατρέψτε πρώτα τις εικόνες HEIC σε JPEG.",
  "Use a JPEG, PNG, or WebP photograph. Export HEIC images to JPEG first.":
    "Χρησιμοποιήστε φωτογραφία JPEG, PNG ή WebP. Μετατρέψτε πρώτα τις εικόνες HEIC σε JPEG.",
  "The photograph could not be decoded.":
    "Δεν ήταν δυνατή η ανάγνωση της φωτογραφίας.",
  "The photograph could not be processed.":
    "Δεν ήταν δυνατή η επεξεργασία της φωτογραφίας.",
  "The image could not be decoded. Choose a valid JPEG, PNG, or WebP photograph.":
    "Δεν ήταν δυνατή η ανάγνωση της εικόνας. Επιλέξτε έγκυρη φωτογραφία JPEG, PNG ή WebP.",
  "The image could not be decoded. Choose a valid JPEG, PNG, or WebP file.":
    "Δεν ήταν δυνατή η ανάγνωση της εικόνας. Επιλέξτε έγκυρο αρχείο JPEG, PNG ή WebP.",
  "Image processing is unavailable in this browser. Reload or use another browser.":
    "Η επεξεργασία εικόνας δεν είναι διαθέσιμη σε αυτόν τον περιηγητή. Ανανεώστε τη σελίδα ή χρησιμοποιήστε άλλον περιηγητή.",
  "Image processing is unavailable in this browser.":
    "Η επεξεργασία εικόνας δεν είναι διαθέσιμη σε αυτόν τον περιηγητή.",
  "Image exceeds the 12 MB upload limit.":
    "Η εικόνα υπερβαίνει το όριο των 12 MB.",
  "Image exceeds the 20 megapixel limit. Resize it before uploading.":
    "Η εικόνα υπερβαίνει το όριο των 20 megapixel. Μειώστε τις διαστάσεις της πριν την επιλέξετε ξανά.",
  "Image dimensions must each be at least 64 pixels.":
    "Κάθε διάσταση της εικόνας πρέπει να είναι τουλάχιστον 64 pixel.",
  "Image dimensions must be at least 64 pixels per side and no more than 20 megapixels.":
    "Κάθε πλευρά της εικόνας πρέπει να είναι τουλάχιστον 64 pixel και το σύνολο να μην υπερβαίνει τα 20 megapixel.",
  "This photograph is too large for the browser canvas. Resize it and retry.":
    "Η φωτογραφία είναι πολύ μεγάλη για την επεξεργασία του περιηγητή. Μειώστε τις διαστάσεις της και δοκιμάστε ξανά.",
  "Low edge detail: the photo may be blurred or lack texture. Review before measuring.":
    "Χαμηλή ευκρίνεια ακμών: η φωτογραφία ίσως είναι θολή ή έχει λίγη υφή. Ελέγξτε την πριν μετρήσετε.",
  "Low overall lighting. Retake with soft, even illumination if boundaries are unclear.":
    "Χαμηλός συνολικός φωτισμός. Αν τα όρια δεν διακρίνονται καθαρά, επαναλάβετε τη λήψη με απαλό, ομοιόμορφο φως.",
  "High overall brightness. Check that the nail boundary is still visible.":
    "Υψηλή συνολική φωτεινότητα. Ελέγξτε ότι το όριο του νυχιού παραμένει ορατό.",
  "Many near-white pixels: inspect for glare or overexposure; a white background can also trigger this.":
    "Πολλά σχεδόν λευκά pixel: ελέγξτε για αντανακλάσεις ή υπερέκθεση. Η ένδειξη μπορεί να οφείλεται και σε λευκό φόντο.",
  "Browser canvas heuristics on a maximum 1024-pixel analysis image. Scores are not interchangeable with server OpenCV scores and do not establish boundaries, framing, scale, or accuracy.":
    "Ενδεικτικοί έλεγχοι στον περιηγητή, σε εικόνα ανάλυσης έως 1024 pixel. Οι δείκτες δεν είναι συγκρίσιμοι με εκείνους του OpenCV στον διακομιστή και δεν τεκμηριώνουν περίγραμμα, καδράρισμα, φυσική κλίμακα ή ακρίβεια.",

  // Calibrated photographic measurement and uncertainty.
  "Image points must have finite, nonnegative x and y coordinates.":
    "Τα σημεία της εικόνας πρέπει να έχουν πεπερασμένες, μη αρνητικές συντεταγμένες x και y.",
  "The measurement request contains an unsupported field.":
    "Το αίτημα μέτρησης περιέχει πεδίο που δεν υποστηρίζεται.",
  "Select the top-view photograph to measure.":
    "Επιλέξτε τη φωτογραφία κάτοψης για τη μέτρηση.",
  "Exactly twelve contour control points are required.":
    "Απαιτούνται ακριβώς δώδεκα σημεία ελέγχου του περιγράμματος.",
  "Only calibrated photographic 2D measurement is available.":
    "Προς το παρόν είναι διαθέσιμη μόνο η βαθμονομημένη φωτογραφική μέτρηση δύο διαστάσεων.",
  "Enter a known reference dimension greater than zero and no more than 200 mm.":
    "Εισαγάγετε γνωστή διάσταση αναφοράς μεγαλύτερη από μηδέν και έως 200 mm.",
  "Original image dimensions are unavailable.":
    "Οι αρχικές διαστάσεις της εικόνας δεν είναι διαθέσιμες.",
  "Contour and calibration points must be inside the original image.":
    "Τα σημεία του περιγράμματος και της βαθμονόμησης πρέπει να βρίσκονται μέσα στην αρχική εικόνα.",
  "Contour points must be distinct.":
    "Τα σημεία του περιγράμματος πρέπει να είναι διαφορετικά μεταξύ τους.",
  "The contour has no usable area.":
    "Το περίγραμμα δεν ορίζει αξιοποιήσιμη επιφάνεια.",
  "Contour edges cross or touch. Correct the control points before measuring.":
    "Οι ακμές του περιγράμματος τέμνονται ή εφάπτονται. Διορθώστε τα σημεία ελέγχου πριν μετρήσετε.",
  "Calibration endpoints must be at least five image pixels apart.":
    "Τα άκρα βαθμονόμησης πρέπει να απέχουν τουλάχιστον πέντε pixel της αρχικής εικόνας.",
  "Cuticle and distal landmarks must be at least five image pixels apart.":
    "Τα σημεία του εγγύς και του άπω ορίου πρέπει να απέχουν τουλάχιστον πέντε pixel της αρχικής εικόνας.",
  "Mark point 3 on the right sidewall and point 9 on the left, relative to the cuticle-to-distal axis.":
    "Τοποθετήστε το σημείο 3 στο δεξί πλαϊνό όριο και το 9 στο αριστερό, ως προς τον άξονα από το εγγύς προς το άπω όριο.",
  "The cuticle and distal landmarks do not span this contour. Correct points 0 and 6.":
    "Τα σημεία του εγγύς και του άπω ορίου δεν καλύπτουν αυτό το περίγραμμα. Διορθώστε τα σημεία 0 και 6.",
  "The contour is too narrow to measure.":
    "Το περίγραμμα είναι πολύ στενό για μέτρηση.",
  "The calibrated 2D method currently uses the top-view image only.":
    "Η βαθμονομημένη μέθοδος δύο διαστάσεων χρησιμοποιεί προς το παρόν μόνο τη φωτογραφία κάτοψης.",
  "Physical scale assumes the reference and contour lie in the same plane. Two reference points cannot verify this or correct perspective.":
    "Η φυσική κλίμακα προϋποθέτει ότι το αντικείμενο αναφοράς και το περίγραμμα βρίσκονται στο ίδιο επίπεδο. Δύο σημεία αναφοράς δεν αρκούν για να επαληθεύσουν αυτήν την υπόθεση ή να διορθώσουν την προοπτική.",
  "Length and widths are projected 2D measurements of a manually reviewed polygon, not surface arc lengths or a verified fit.":
    "Το μήκος και τα πλάτη είναι δισδιάστατες προβολές ενός πολυγώνου που ελέγχθηκε χειροκίνητα. Δεν είναι μήκη τόξων πάνω στην επιφάνεια ούτε τεκμηρίωση εφαρμογής.",
  "Curvature remains unknown; front, side, and oblique photos are retained for professional inspection only.":
    "Η καμπυλότητα παραμένει άγνωστη. Οι πρόσθιες, πλάγιες και λοξές φωτογραφίες διατηρούνται μόνο για επαγγελματική επιθεώρηση.",
  "Some boundary points extend beyond the cuticle/distal axis landmarks. Review the landmark placement.":
    "Ορισμένα σημεία του περιγράμματος εκτείνονται πέρα από τα σημεία του εγγύς και του άπω ορίου. Ελέγξτε την τοποθέτηση των σημείων αναφοράς.",
  "Unquantified: manual landmark placement, reference dimensions, perspective, and coplanarity have not been independently validated.":
    "Μη ποσοτικοποιημένη αβεβαιότητα: η χειροκίνητη τοποθέτηση σημείων, οι διαστάσεις αναφοράς, η προοπτική και η συνεπιπεδότητα δεν έχουν επαληθευτεί ανεξάρτητα.",

  // Generation errors and the limits of faceted/smooth research geometry.
  "Degenerate surface or triangle for these parameters.":
    "Οι παράμετροι οδηγούν σε εκφυλισμένη επιφάνεια ή τρίγωνο.",
  "Degenerate surface for these design parameters.":
    "Οι παράμετροι σχεδιασμού οδηγούν σε εκφυλισμένη επιφάνεια.",
  "Transverse rise must not exceed 45% of width in this engine.":
    "Σε αυτόν τον κινητήρα, το εγκάρσιο ύψος καμπύλωσης δεν μπορεί να υπερβαίνει το 45% του πλάτους.",
  "Transverse rise must not exceed 45% of width.":
    "Το εγκάρσιο ύψος καμπύλωσης δεν μπορεί να υπερβαίνει το 45% του πλάτους.",
  "Asymmetry must not exceed 15% of width (maximum 2 mm).":
    "Η ασυμμετρία δεν μπορεί να υπερβαίνει το 15% του πλάτους, με μέγιστο όριο 2 mm.",
  "Asymmetry exceeds this width's experimental geometry limits.":
    "Η ασυμμετρία υπερβαίνει τα πειραματικά όρια γεωμετρίας για αυτό το πλάτος.",
  "tip_shape must be oval, squoval or almond.":
    "Επιλέξτε οβάλ, τετράγωνο με στρογγυλεμένες γωνίες ή αμυγδαλωτό σχήμα άκρης.",
  "The design surface folds for these parameters. Reduce curvature or asymmetry.":
    "Η επιφάνεια σχεδιασμού αναδιπλώνεται με αυτές τις παραμέτρους. Μειώστε την καμπυλότητα ή την ασυμμετρία.",
  "STEP cannot encode a non-finite coordinate.":
    "Δεν είναι δυνατή η εξαγωγή μη πεπερασμένης συντεταγμένης σε STEP.",
  "Review the projected dimensions and explicit manual inputs before generating research CAD.":
    "Ελέγξτε τις διαστάσεις της δισδιάστατης προβολής και τις χειροκίνητα ορισμένες παραμέτρους πριν δημιουργήσετε ερευνητικό CAD.",
  "Complete calibration and contour measurement before generating research CAD.":
    "Ολοκληρώστε τη βαθμονόμηση και τη μέτρηση του περιγράμματος πριν δημιουργήσετε ερευνητικό CAD.",
  "Browser mesh validation did not pass. Exports were withheld; adjust the experimental parameters.":
    "Το πλέγμα δεν πέρασε τους ελέγχους στον περιηγητή. Δεν διατέθηκαν αρχεία εξαγωγής. Προσαρμόστε τις πειραματικές παραμέτρους.",
  "Browser geometry generation failed. Adjust the experimental parameters.":
    "Η δημιουργία γεωμετρίας στον περιηγητή απέτυχε. Προσαρμόστε τις πειραματικές παραμέτρους.",
  "CAD generation could not create a valid solid for these parameters.":
    "Η δημιουργία CAD δεν παρήγαγε έγκυρο στερεό με αυτές τις παραμέτρους.",
  "CAD generation failed. Inspect the server log and adjust the experimental parameters.":
    "Η δημιουργία CAD απέτυχε. Ελέγξτε το αρχείο καταγραφής του διακομιστή και προσαρμόστε τις πειραματικές παραμέτρους.",
  "CAD validation did not pass.": "Το CAD δεν πέρασε τους ελέγχους.",
  "CAD validation did not pass; export withheld.":
    "Το CAD δεν πέρασε τους ελέγχους· δεν διατέθηκαν αρχεία εξαγωγής.",
  "CAD validation did not pass. Exports were withheld; adjust the parameters.":
    "Το CAD δεν πέρασε τους ελέγχους. Δεν διατέθηκαν αρχεία εξαγωγής· προσαρμόστε τις παραμέτρους.",
  "Experimental, non-wearable laboratory geometry. Physical fit is unverified.":
    "Πειραματική εργαστηριακή γεωμετρία που δεν προορίζεται για χρήση πάνω σε άνθρωπο. Η φυσική εφαρμογή δεν έχει επαληθευτεί.",
  "Non-wearable laboratory prototype. Material and product safety have not been assessed.":
    "Εργαστηριακό πρωτότυπο που δεν προορίζεται για χρήση πάνω σε άνθρωπο. Δεν έχει αξιολογηθεί η ασφάλεια του υλικού ή του προϊόντος.",
  "Parametric length/width approximation; photographed contour is not reconstructed as an exact CAD boundary.":
    "Παραμετρική προσέγγιση από μήκος και πλάτος· το φωτογραφημένο περίγραμμα δεν ανακατασκευάζεται ως ακριβές όριο CAD.",
  "Directly sampled, faceted parametric shell. This browser engine does not fit the smooth B-spline surfaces used by the Python CadQuery engine.":
    "Παραμετρικό κέλυφος με επίπεδες έδρες από άμεση δειγματοληψία. Ο κινητήρας του περιηγητή δεν προσαρμόζει τις ομαλές επιφάνειες B-spline του κινητήρα Python/CadQuery.",
  "Projected length/width and manual curvature inputs do not reconstruct the photographic contour as a verified 3D contact surface.":
    "Το μήκος και το πλάτος της προβολής, μαζί με τη χειροκίνητα ορισμένη καμπυλότητα, δεν ανακατασκευάζουν το φωτογραφικό περίγραμμα ως επαληθευμένη τρισδιάστατη επιφάνεια επαφής.",
  "Thickness is a displacement along sampled surface normals. Neither global minimum wall thickness nor interior surface separation is verified.":
    "Το πάχος ορίζεται ως μετατόπιση κατά τις κανονικές της επιφάνειας στα σημεία δειγματοληψίας. Δεν επαληθεύεται ούτε το καθολικό ελάχιστο πάχος ούτε η απόσταση μεταξύ επιφανειών σε κάθε εσωτερική θέση.",
  "Mesh edge topology, winding, finite coordinates, triangle area and signed volume are checked. No CAD kernel or independent global self-intersection check runs in the browser.":
    "Ελέγχονται η τοπολογία ακμών του πλέγματος, ο προσανατολισμός, οι πεπερασμένες συντεταγμένες, το εμβαδόν τριγώνων και ο προσημασμένος όγκος. Δεν εκτελείται πυρήνας CAD ούτε ανεξάρτητος καθολικός έλεγχος αυτοτομών στον περιηγητή.",
  "STEP contains planar triangular faces in a faceted BRep, not editable smooth parametric surfaces. Runtime STEP re-import is not performed in this browser.":
    "Το STEP περιέχει επίπεδες τριγωνικές έδρες σε αναπαράσταση BRep, όχι επεξεργάσιμες ομαλές παραμετρικές επιφάνειες. Δεν γίνεται επανεισαγωγή του STEP για έλεγχο μέσα σε αυτόν τον περιηγητή.",
  "No fastening allowance, printer compensation, material suitability or physical fit has been validated. Non-wearable laboratory prototype only.":
    "Δεν έχουν επικυρωθεί διάκενο στερέωσης, αντιστάθμιση εκτυπωτή, καταλληλότητα υλικού ή φυσική εφαρμογή. Πρόκειται μόνο για εργαστηριακό πρωτότυπο που δεν προορίζεται για χρήση πάνω σε άνθρωπο.",
  "A parametric approximation from projected length/width and manual inputs; the photographic contour is not reconstructed as a 3D contact surface.":
    "Παραμετρική προσέγγιση από το μήκος και το πλάτος της προβολής και χειροκίνητες παραμέτρους· το φωτογραφικό περίγραμμα δεν ανακατασκευάζεται ως τρισδιάστατη επιφάνεια επαφής.",
  "Outer surface approximates a sampled surface-normal offset. Thickness checks sample surface separation, not a proof of global minimum thickness.":
    "Η εξωτερική επιφάνεια προσεγγίζει μετατόπιση κατά τη δειγματοληπτούμενη κανονική. Οι έλεγχοι πάχους δειγματοληπτούν την απόσταση επιφανειών και δεν αποδεικνύουν καθολικό ελάχιστο πάχος.",
  "OpenCascade validity and mesh topology are checked. An independent global triangle self-intersection test is not implemented.":
    "Ελέγχονται η εγκυρότητα στο OpenCascade και η τοπολογία του πλέγματος. Δεν έχει υλοποιηθεί ανεξάρτητος καθολικός έλεγχος αυτοτομών τριγώνων.",
  "NAILFORM browser faceted mesh V1":
    "NAILFORM · τριγωνικό πλέγμα στον περιηγητή V1",
  "CadQuery / OpenCascade parametric shell V1":
    "CadQuery / OpenCascade · παραμετρικό κέλυφος V1",
  faceted_parametric_shell: "Παραμετρικό κέλυφος με επίπεδες έδρες",
  parametric_approximation: "Παραμετρική προσέγγιση",
  faceted_brep: "Στερεό BRep με επίπεδες έδρες",
  "IEEE 754 float32, shared by viewer and both exports":
    "Ακρίβεια IEEE 754 float32, κοινή στην προβολή και στις δύο εξαγωγές",
  "Outer vertices displaced along sampled inner-surface normals; faceted interpolation between samples.":
    "Οι εξωτερικές κορυφές μετατοπίζονται κατά τις κανονικές της εσωτερικής επιφάνειας στα σημεία δειγματοληψίας· μεταξύ τους παρεμβάλλονται επίπεδες έδρες.",
  "Outer B-spline fitted to inner surface samples displaced along their local normal.":
    "Εξωτερική B-spline προσαρμοσμένη σε δείγματα της εσωτερικής επιφάνειας που μετατοπίστηκαν κατά την τοπική κανονική τους.",
  "Listed mesh checks only; no runtime CAD-kernel solid validation.":
    "Μόνο οι αναφερόμενοι έλεγχοι πλέγματος· δεν εκτελείται έλεγχος στερεού από πυρήνα CAD.",
  "Nearest outer-face distance at 35 interior points projected onto the inner face.":
    "Ελάχιστη απόσταση από την εξωτερική έδρα σε 35 εσωτερικά σημεία που προβάλλονται στην εσωτερική έδρα.",

  // Version summaries stored in English and translated only for presentation.
  "Consent recorded for private browser research storage; session created.":
    "Καταγράφηκε συγκατάθεση για ιδιωτική ερευνητική αποθήκευση στον περιηγητή και δημιουργήθηκε η συνεδρία.",
  "Research storage consent recorded; session created.":
    "Καταγράφηκε συγκατάθεση για ερευνητική αποθήκευση και δημιουργήθηκε η συνεδρία.",
  "Professional image annotations updated.":
    "Ενημερώθηκαν οι επαγγελματικές σημειώσεις στις φωτογραφίες.",
  "Declared independent reference observations and repeat group updated.":
    "Ενημερώθηκαν οι δηλωμένες ανεξάρτητες μετρήσεις αναφοράς και η ομάδα επαναλήψεων.",
  "Professional notes, research state, or session name updated.":
    "Ενημερώθηκαν οι επαγγελματικές σημειώσεις, η κατάσταση έρευνας ή το όνομα της συνεδρίας.",
  "Image and dependent measurements/model exports removed from browser storage.":
    "Διαγράφηκαν από τον περιηγητή η εικόνα και οι μετρήσεις ή εξαγωγές μοντέλων που εξαρτώνταν από αυτήν.",
  "Image and dependent measurements/model exports removed.":
    "Διαγράφηκαν η εικόνα και οι μετρήσεις ή εξαγωγές μοντέλων που εξαρτώνταν από αυτήν.",
  "Calibrated projected 2D dimensions recorded from manually placed contour.":
    "Καταγράφηκαν βαθμονομημένες δισδιάστατες διαστάσεις προβολής από χειροκίνητα ορισμένο περίγραμμα.",
  "Experimental faceted shell generated in the browser from projected dimensions and explicit manual inputs.":
    "Δημιουργήθηκε πειραματικό κέλυφος με επίπεδες έδρες στον περιηγητή, από διαστάσεις προβολής και ρητά ορισμένες χειροκίνητες παραμέτρους.",
  "Experimental shell generated from projected dimensions and explicit manual parameters.":
    "Δημιουργήθηκε πειραματικό κέλυφος από διαστάσεις προβολής και ρητά ορισμένες χειροκίνητες παραμέτρους.",
  "Top photograph stored on this device; quality requires human review.":
    "Η φωτογραφία κάτοψης αποθηκεύτηκε σε αυτήν τη συσκευή· η ποιότητά της απαιτεί ανθρώπινο έλεγχο.",
  "Front photograph stored on this device; quality requires human review.":
    "Η φωτογραφία πρόσοψης αποθηκεύτηκε σε αυτήν τη συσκευή· η ποιότητά της απαιτεί ανθρώπινο έλεγχο.",
  "Side photograph stored on this device; quality requires human review.":
    "Η πλάγια φωτογραφία αποθηκεύτηκε σε αυτήν τη συσκευή· η ποιότητά της απαιτεί ανθρώπινο έλεγχο.",
  "Oblique photograph stored on this device; quality requires human review.":
    "Η λοξή φωτογραφία αποθηκεύτηκε σε αυτήν τη συσκευή· η ποιότητά της απαιτεί ανθρώπινο έλεγχο.",
  "Top photograph stored; image quality requires human review.":
    "Η φωτογραφία κάτοψης αποθηκεύτηκε· η ποιότητά της απαιτεί ανθρώπινο έλεγχο.",
  "Front photograph stored; image quality requires human review.":
    "Η φωτογραφία πρόσοψης αποθηκεύτηκε· η ποιότητά της απαιτεί ανθρώπινο έλεγχο.",
  "Side photograph stored; image quality requires human review.":
    "Η πλάγια φωτογραφία αποθηκεύτηκε· η ποιότητά της απαιτεί ανθρώπινο έλεγχο.",
  "Oblique photograph stored; image quality requires human review.":
    "Η λοξή φωτογραφία αποθηκεύτηκε· η ποιότητά της απαιτεί ανθρώπινο έλεγχο.",

  // Parameterized messages: central t() can match placeholders and translate labels.
  "{label} must be an object.":
    "Το πεδίο «{label}» πρέπει να είναι αντικείμενο δεδομένων.",
  "{label} must contain {min}–{max} characters.":
    "Το πεδίο «{label}» πρέπει να έχει από {min} έως {max} χαρακτήρες.",
  "{label} must contain at most {max} characters.":
    "Το πεδίο «{label}» πρέπει να έχει έως {max} χαρακτήρες.",
  "{label} must be a finite number between {low} and {high}.":
    "Το πεδίο «{label}» πρέπει να είναι πεπερασμένος αριθμός από {low} έως {high}.",
  "{name} must be a finite number between {low} and {high} mm.":
    "Το πεδίο «{name}» πρέπει να είναι πεπερασμένος αριθμός από {low} έως {high} mm.",
  "{label} must be true or false.":
    "Το πεδίο «{label}» πρέπει να έχει τιμή ναι ή όχι.",
  "{name} must be a finite number in millimetres.":
    "Το πεδίο «{name}» πρέπει να είναι πεπερασμένος αριθμός σε χιλιοστά.",
  "{name} is required and must be a finite number.":
    "Το πεδίο «{name}» είναι υποχρεωτικό και πρέπει να είναι πεπερασμένος αριθμός.",
  "{name} must be between {low} and {high} mm.":
    "Το πεδίο «{name}» πρέπει να είναι από {low} έως {high} mm.",
  "Browser geometry failed mesh validation: {checks}.":
    "Η γεωμετρία δεν πέρασε τους ελέγχους πλέγματος στον περιηγητή: {checks}.",
  "Generated geometry failed validation: {checks}.":
    "Η γεωμετρία που δημιουργήθηκε δεν πέρασε τους ελέγχους: {checks}.",
  "Exported geometry failed validation: {checks}.":
    "Η εξαγόμενη γεωμετρία δεν πέρασε τους ελέγχους: {checks}.",
  Request: "Αίτημα",
  "Image point": "Σημείο εικόνας",
  Measurement: "Μέτρηση",
  Calibration: "Βαθμονόμηση",
  Feedback: "Παρατηρήσεις",
  "Review notes": "Σημειώσεις ελέγχου",
  Issue: "Πρόβλημα",
  "Contour acceptance": "Αποδοχή περιγράμματος",
  "Geometry acceptance": "Αποδοχή γεωμετρίας",
  "Experiment observations": "Παρατηρήσεις πειράματος",
  "Reference length": "Μήκος αναφοράς",
  "Reference width": "Πλάτος αναφοράς",
  "Reference description": "Περιγραφή αναφοράς",
  "Repeated-reference group": "Ομάδα επαναλήψεων αναφοράς",
  "Observed effort": "Καταγεγραμμένος χρόνος προσπάθειας",
  "Experiment notes": "Σημειώσεις πειράματος",
  Annotation: "Σημείωση εικόνας",
  "Annotation image identifier": "Αναγνωριστικό εικόνας σημείωσης",
  "Annotation identifier": "Αναγνωριστικό σημείωσης",
  "Annotation x": "Συντεταγμένη x σημείωσης",
  "Annotation y": "Συντεταγμένη y σημείωσης",
  "Photo note": "Σημείωση φωτογραφίας",
  "Session name": "Όνομα συνεδρίας",
  "Research state": "Κατάσταση έρευνας",
  "Geometry parameters": "Παράμετροι γεωμετρίας",
  length_mm: "Μήκος",
  width_mm: "Πλάτος",
  transverse_rise_mm: "Εγκάρσιο ύψος καμπύλωσης",
  longitudinal_rise_mm: "Διαμήκες ύψος καμπύλωσης",
  thickness_mm: "Ονομαστικό πάχος",
  extension_mm: "Επέκταση",
  asymmetry_mm: "Ασυμμετρία",
  tip_shape: "Σχήμα άκρης",
  valid_solid: "έγκυρο στερεό",
  watertight_mesh: "κλειστό πλέγμα",
  nonzero_volume: "θετικός μη μηδενικός όγκος",
  consistent_normals: "συνεπής προσανατολισμός",
  finite_mesh: "πεπερασμένες συντεταγμένες",
  nondegenerate_triangles: "μη εκφυλισμένα τρίγωνα",
  sampled_thickness: "δειγματοληπτικός έλεγχος πάχους",
  expected_dimensions: "αναμενόμενες διαστάσεις",
  step_roundtrip: "επανεισαγωγή STEP",
  stl_roundtrip: "επανεισαγωγή STL",
  mesh_brep_volume_agreement: "συμφωνία όγκου πλέγματος και CAD",
  connected_mesh: "ενιαίο συνδεδεμένο πλέγμα",
  sphere_topology: "τοπολογία κλειστής επιφάνειας γένους μηδέν",

  // Recognized generic API/network fallbacks.
  "The request could not be completed.":
    "Το αίτημα δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
  "Failed to fetch":
    "Δεν ήταν δυνατή η σύνδεση. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.",
  "NetworkError when attempting to fetch resource.":
    "Δεν ήταν δυνατή η σύνδεση. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.",
  "Load failed": "Η φόρτωση απέτυχε. Δοκιμάστε ξανά.",
  "Not Found": "Το ζητούμενο στοιχείο δεν βρέθηκε.",
  "Bad Request": "Το αίτημα δεν είναι έγκυρο. Ελέγξτε τα στοιχεία σας.",
  "Unprocessable Entity":
    "Τα στοιχεία δεν μπορούν να επεξεργαστούν. Ελέγξτε τις τιμές που εισαγάγατε.",
  "Internal Server Error":
    "Παρουσιάστηκε σφάλμα στον διακομιστή. Δοκιμάστε ξανά.",
  "Service Unavailable":
    "Η υπηρεσία δεν είναι διαθέσιμη αυτήν τη στιγμή. Δοκιμάστε ξανά αργότερα.",
  "Field required": "Το πεδίο είναι υποχρεωτικό.",
  "Extra inputs are not permitted": "Δεν επιτρέπονται πρόσθετα πεδία.",
  "Input should be a valid number": "Η τιμή πρέπει να είναι έγκυρος αριθμός.",
  "Input should be a finite number":
    "Η τιμή πρέπει να είναι πεπερασμένος αριθμός.",
  "Input should be a valid string": "Η τιμή πρέπει να είναι κείμενο.",
  "Input should be a valid boolean": "Η τιμή πρέπει να είναι ναι ή όχι.",
  "Input should be True": "Απαιτείται ρητή επιβεβαίωση.",
  "Input should be greater than {limit}":
    "Η τιμή πρέπει να είναι μεγαλύτερη από {limit}.",
  "Input should be greater than or equal to {limit}":
    "Η τιμή πρέπει να είναι μεγαλύτερη ή ίση με {limit}.",
  "Input should be less than or equal to {limit}":
    "Η τιμή πρέπει να είναι μικρότερη ή ίση με {limit}.",
  "String should have at least {limit} character":
    "Το κείμενο πρέπει να έχει τουλάχιστον {limit} χαρακτήρα.",
  "String should have at least {limit} characters":
    "Το κείμενο πρέπει να έχει τουλάχιστον {limit} χαρακτήρες.",
  "String should have at most {limit} characters":
    "Το κείμενο πρέπει να έχει έως {limit} χαρακτήρες.",
  "Value error, {message}": "Μη έγκυρη τιμή: {message}",
};
