/** Proposal API messages. Research data/provenance keys remain in English. */
export const autoErrorsEl: Record<string, string> = {
  "Design preferences must be an object.":
    "Οι προτιμήσεις σχεδιασμού πρέπει να έχουν έγκυρη μορφή.",
  "Choose oval, squoval, or almond as the extension shape.":
    "Επιλέξτε οβάλ, τετραγωνισμένο με στρογγυλεμένες γωνίες ή αμυγδαλωτό σχήμα για το εξωτερικό άκρο.",
  "Extension length must be a finite number between 0 and 15 mm.":
    "Το μήκος προέκτασης πρέπει να είναι πεπερασμένος αριθμός από 0 έως 15 mm.",
  "External extension design preferences saved.":
    "Αποθηκεύτηκαν οι προτιμήσεις σχεδιασμού του εξωτερικού άκρου.",
  design: "σχεδιασμός",
  "Only top-view photographs support an automatic contour proposal.":
    "Η αυτόματη πρόταση περιγράμματος υποστηρίζεται μόνο σε φωτογραφίες από πάνω.",
  "An automatic contour proposal must contain exactly twelve control points.":
    "Η αυτόματη πρόταση περιγράμματος πρέπει να περιλαμβάνει ακριβώς δώδεκα σημεία ελέγχου.",
  "Automatic contour proposal points must be finite and inside the original image.":
    "Τα σημεία της αυτόματης πρότασης πρέπει να έχουν έγκυρες πεπερασμένες συντεταγμένες και να βρίσκονται μέσα στην αρχική εικόνα.",
  "Automatic contour proposal points must be distinct.":
    "Τα σημεία της αυτόματης πρότασης περιγράμματος πρέπει να είναι διαφορετικά μεταξύ τους.",
  "The automatic contour proposal has no usable area.":
    "Η αυτόματη πρόταση περιγράμματος δεν ορίζει αξιοποιήσιμη επιφάνεια.",
  "Automatic contour proposal edges cross or touch. Retake the photograph or use manual mode.":
    "Οι γραμμές της αυτόματης πρότασης τέμνονται ή εφάπτονται. Επαναλάβετε τη λήψη ή χρησιμοποιήστε τη χειροκίνητη λειτουργία.",
  "Automatic contour proposal landmarks do not define a usable cuticle-to-distal axis.":
    "Τα σημεία αναφοράς της αυτόματης πρότασης δεν ορίζουν αξιοποιήσιμο άξονα από το επωνύχιο προς το άπω άκρο.",
  "Automatic contour proposal sidewall landmarks are inconsistent. Use manual mode or retake the photograph.":
    "Τα σημεία των πλαϊνών ορίων στην αυτόματη πρόταση δεν είναι συνεπή. Χρησιμοποιήστε τη χειροκίνητη λειτουργία ή επαναλάβετε τη λήψη.",
  "Automatic contour proposal cuticle and distal landmarks do not span the outline.":
    "Τα σημεία επωνυχίου και άπω άκρου της αυτόματης πρότασης δεν καλύπτουν το μήκος του περιγράμματος.",
  "The contour proposal method is unsupported.":
    "Η μέθοδος πρότασης περιγράμματος δεν υποστηρίζεται.",
  "Choose live_camera or photo as the contour proposal source.":
    "Επιλέξτε ζωντανή κάμερα ή φωτογραφία ως προέλευση της πρότασης περιγράμματος.",
  "Choose up or down as the proposed tip direction.":
    "Επιλέξτε προς τα πάνω ή προς τα κάτω για την κατεύθυνση του άκρου του νυχιού.",
  "Select the top-view photograph for the contour proposal.":
    "Επιλέξτε τη φωτογραφία από πάνω για την πρόταση περιγράμματος.",
  "Contour proposal identifier must be a nonempty string.":
    "Το αναγνωριστικό της πρότασης περιγράμματος πρέπει να είναι έγκυρο και να μην είναι κενό.",
  "Contour proposal not found for this image in this research session.":
    "Δεν βρέθηκε αυτή η πρόταση περιγράμματος για τη συγκεκριμένη εικόνα σε αυτή την ερευνητική συνεδρία.",
  "Experimental image-derived contour proposal stored; manual review and calibration remain required.":
    "Αποθηκεύτηκε πειραματική πρόταση περιγράμματος από την εικόνα. Εξακολουθούν να απαιτούνται χειροκίνητος έλεγχος και βαθμονόμηση.",
  "Calibrated projected 2D dimensions recorded from a human-reviewed automatic contour proposal.":
    "Καταγράφηκαν βαθμονομημένες διαστάσεις της δισδιάστατης προβολής από αυτόματη πρόταση περιγράμματος που ελέγχθηκε από άνθρωπο.",
  "Calibrated projected 2D dimensions recorded from a human-adjusted automatic contour proposal.":
    "Καταγράφηκαν βαθμονομημένες διαστάσεις της δισδιάστατης προβολής από αυτόματη πρόταση περιγράμματος που διορθώθηκε από άνθρωπο.",
  "Automatic contour is an experimental image-derived proposal; human review does not establish validated segmentation accuracy or physical fit.":
    "Το αυτόματο περίγραμμα είναι πειραματική πρόταση που προκύπτει από την εικόνα. Ο ανθρώπινος έλεγχος δεν τεκμηριώνει επικυρωμένη ακρίβεια τμηματοποίησης ή φυσική εφαρμογή.",
  contour_proposal: "πρόταση περιγράμματος",
  "contour proposal": "πρόταση περιγράμματος",
};
