// Public landing-page demo — canned dictation samples.
//
// These are FICTIONAL, illustrative French radiology dictations used only by the
// public marketing demo. They contain NO real patient data. Each one is crafted
// so that the REAL Feature-7 engine (detectSelfCorrections → cleanupFrench →
// parseStructuredText) produces a clean, honestly-derived HPD report — the demo
// never fakes output, it runs the same deterministic pipeline as the product.
//
// Each sample purposely shows:
//   • explicit dictated section cues (Indication / Technique / Résultats / Conclusion)
//   • a natural self-correction the radiologist speaks mid-dictation
//   • (some) a dictation artefact (filler / repetition) the cleanup removes
//
// The patient identity is fictional demo metadata (as if from the worklist) — it
// is NOT parsed from the dictation, mirroring how the product sources identity.

export interface DemoPatient {
  name: string
  age: string
  sex: string
}

export interface DemoSample {
  /** Stable id + i18n label key under `demo.samples`. */
  id: 'cerebral' | 'thoracique' | 'abdominale'
  /** Fictional demo patient shown in the report preview's identity box. */
  patient: DemoPatient
  /** The raw dictation, exactly as displayed in "Dictée brute" and fed to the engine. */
  dictation: string
}

export const DEMO_SAMPLES: DemoSample[] = [
  {
    id: 'cerebral',
    patient: { name: 'Mamadou Diop', age: '56 ans', sex: 'Masculin' },
    dictation: [
      'Indication : traumatisme crânien.',
      'Technique : scanner cérébral sans injection de produit de contraste.',
      'Résultats :',
      "Pas d'hémorragie intracrânienne. Je corrige. Petite hyperdensité frontale droite.",
      'Conclusion : aspect compatible avec euh une contusion frontale droite.',
    ].join('\n'),
  },
  {
    id: 'thoracique',
    patient: { name: 'Awa Ndiaye', age: '63 ans', sex: 'Féminin' },
    dictation: [
      "Indication : bilan d'une toux chronique.",
      'Technique : scanner thoracique sans injection de produit de contraste.',
      'Résultats :',
      'Épanchement pleural droit de grande abondance. Non. Fine lame lame pleurale droite.',
      'Conclusion : fine lame pleurale droite, sans autre anomalie significative.',
    ].join('\n'),
  },
  {
    id: 'abdominale',
    patient: { name: 'Ousmane Fall', age: '41 ans', sex: 'Masculin' },
    dictation: [
      "Indication : douleurs de l'hypochondre droit.",
      'Technique : échographie abdominale réalisée par voie transcutanée.',
      'Résultats :',
      'Lithiase vésiculaire avec paroi épaissie. Je corrige. Lithiase vésiculaire sans épaississement pariétal.',
      'Conclusion : lithiase vésiculaire non compliquée.',
    ].join('\n'),
  },
]
