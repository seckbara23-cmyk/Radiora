export type TranslationLang = 'en' | 'fr'

// ─── Bilingual phrase dictionary ──────────────────────────────────────────────
// Listed longest → shortest so greedy phrase matching takes precedence.
// [english, french]

const PHRASE_PAIRS: readonly [string, string][] = [
  // Multi-word radiology expressions
  ['no acute cardiopulmonary process',   'aucune anomalie cardiopulmonaire aiguë'],
  ['no acute cardiopulmonary findings',  'aucune anomalie cardiopulmonaire aiguë'],
  ['no acute findings',                  'aucune anomalie aiguë'],
  ['no acute abnormality',               'aucune anomalie aiguë'],
  ['within normal limits',               'dans les limites normales'],
  ['no evidence of',                     'aucune évidence de'],
  ['no significant',                     'aucune'],
  ['consistent with',                    'compatible avec'],
  ['interval change',                    'modification par rapport au précédent examen'],
  ['further evaluation',                 'évaluation complémentaire'],
  ['is recommended',                     'est recommandé'],
  ['are recommended',                    'sont recommandés'],
  ['unremarkable in appearance',         'sans particularité à l\'imagerie'],

  // Compound anatomy
  ['right lower lobe',    'lobe inférieur droit'],
  ['right upper lobe',    'lobe supérieur droit'],
  ['left lower lobe',     'lobe inférieur gauche'],
  ['left upper lobe',     'lobe supérieur gauche'],
  ['right middle lobe',   'lobe moyen droit'],
  ['right lung',          'poumon droit'],
  ['left lung',           'poumon gauche'],
  ['right kidney',        'rein droit'],
  ['left kidney',         'rein gauche'],
  ['right lobe',          'lobe droit'],
  ['left lobe',           'lobe gauche'],
  ['pleural effusion',    'épanchement pleural'],
  ['pericardial effusion','épanchement péricardique'],
  ['pulmonary edema',     'œdème pulmonaire'],
  ['pulmonary oedema',    'œdème pulmonaire'],
  ['pulmonary embolism',  'embolie pulmonaire'],
  ['ground glass',        'verre dépoli'],
  ['soft tissues',        'tissus mous'],
  ['soft tissue',         'tissu mou'],
  ['bone marrow',         'moelle osseuse'],
  ['spinal cord',         'moelle épinière'],
  ['lymph nodes',         'ganglions lymphatiques'],
  ['lymph node',          'ganglion lymphatique'],
  ['blood vessels',       'vaisseaux sanguins'],
  ['blood vessel',        'vaisseau sanguin'],
  ['chest wall',          'paroi thoracique'],
  ['gallbladder',         'vésicule biliaire'],

  // Imaging modalities (patient explanation)
  ['CT scan',             'scanner (tomodensitométrie)'],
  ['MRI scan',            'IRM (imagerie par résonance magnétique)'],
  ['X-ray',               'radiographie'],
  ['imaging scan',        'examen d\'imagerie'],

  // Report section labels
  ['Clinical Indication:', 'Indication clinique :'],
  ['Technique:',           'Technique :'],
  ['Findings:',            'Résultats :'],
  ['Impression:',          'Impression :'],
  ['Recommendations:',     'Recommandations :'],

  // Common phrases in patient explanations
  ['What the scan showed:',   'Ce que l\'examen a montré :'],
  ['Details from the scan:',  'Détails de l\'examen :'],
  ['What happens next:',      'Prochaines étapes :'],
  ['has been reviewed by a radiologist', 'a été analysé par un radiologue'],
]

// ─── Bilingual word dictionary ────────────────────────────────────────────────
// [english, french]

const WORD_PAIRS: readonly [string, string][] = [
  // Anatomy
  ['lungs',       'poumons'],   ['lung',       'poumon'],
  ['heart',       'cœur'],
  ['liver',       'foie'],
  ['kidneys',     'reins'],     ['kidney',     'rein'],
  ['brain',       'cerveau'],   ['cerebral',   'cérébral'],
  ['spinal',      'vertébral'], ['spine',      'colonne vertébrale'],
  ['chest',       'thorax'],    ['thoracic',   'thoracique'],
  ['ribs',        'côtes'],     ['rib',        'côte'],
  ['shoulder',    'épaule'],
  ['knee',        'genou'],
  ['hip',         'hanche'],
  ['ankle',       'cheville'],
  ['wrist',       'poignet'],
  ['elbow',       'coude'],
  ['thyroid',     'thyroïde'],
  ['bladder',     'vessie'],
  ['uterus',      'utérus'],
  ['prostate',    'prostate'],
  ['trachea',     'trachée'],
  ['esophagus',   'œsophage'],  ['oesophagus', 'œsophage'],
  ['aorta',       'aorte'],     ['aortic',     'aortique'],
  ['coronary',    'coronaire'],
  ['femur',       'fémur'],     ['femoral',    'fémoral'],
  ['humerus',     'humérus'],   ['humeral',    'huméral'],
  ['diaphragm',   'diaphragme'],
  ['pelvis',      'pelvis'],    ['pelvic',     'pelvien'],
  ['abdomen',     'abdomen'],   ['abdominal',  'abdominal'],

  // Pathology
  ['fracture',           'fracture'],
  ['pneumonia',          'pneumonie'],
  ['tumors',             'tumeurs'],   ['tumor',    'tumeur'],  ['tumour',   'tumeur'],
  ['lesions',            'lésions'],   ['lesion',   'lésion'],
  ['nodules',            'nodules'],   ['nodule',   'nodule'],
  ['cysts',              'kystes'],    ['cyst',     'kyste'],
  ['consolidation',      'consolidation'],
  ['atelectasis',        'atélectasie'],
  ['effusion',           'épanchement'],
  ['edema',              'œdème'],     ['oedema',   'œdème'],
  ['stenosis',           'sténose'],
  ['thrombosis',         'thrombose'],
  ['embolism',           'embolie'],
  ['hemorrhage',         'hémorragie'], ['haemorrhage', 'hémorragie'],
  ['hematoma',           'hématome'],  ['haematoma',   'hématome'],
  ['cardiomegaly',       'cardiomégalie'],
  ['pneumothorax',       'pneumothorax'],
  ['spondylosis',        'spondylose'],
  ['herniation',         'hernie'],
  ['calcification',      'calcification'], ['calcifications', 'calcifications'],
  ['adenopathy',         'adénopathie'],
  ['lymphadenopathy',    'lymphadénopathie'],
  ['neoplasm',           'néoplasme'],
  ['malignancy',         'malignité'],
  ['abscess',            'abcès'],
  ['contusion',          'contusion'],
  ['laceration',         'lacération'],

  // Descriptors
  ['bilateral',    'bilatéral'],  ['unilateral',  'unilatéral'],
  ['posterior',    'postérieur'], ['anterior',    'antérieur'],
  ['superior',     'supérieur'],  ['inferior',    'inférieur'],
  ['lateral',      'latéral'],    ['medial',      'médial'],
  ['proximal',     'proximal'],   ['distal',      'distal'],
  ['acute',        'aigu'],
  ['chronic',      'chronique'],
  ['diffuse',      'diffus'],
  ['focal',        'focal'],
  ['normal',       'normal'],     ['abnormal',    'anormal'],
  ['significant',  'significatif'],
  ['stable',       'stable'],
  ['unchanged',    'inchangé'],
  ['increased',    'augmenté'],   ['decreased',   'diminué'],
  ['enlarged',     'élargi'],
  ['unremarkable', 'sans particularité'],
  ['benign',       'bénin'],      ['malignant',   'malin'],
  ['moderate',     'modéré'],     ['mild',        'léger'],
  ['severe',       'sévère'],

  // Report verbs
  ['demonstrates',  'montre'],   ['demonstrated', 'démontré'],
  ['revealed',      'révélé'],
  ['appears',       'paraît'],
  ['noted',         'noté'],
  ['observed',      'observé'],
  ['shows',         'montre'],
  ['suggestive',    'évocateur'],
  ['recommended',   'recommandé'],
  ['evaluation',    'évaluation'],
  ['correlation',   'corrélation'],
  ['impression',    'impression'],
  ['findings',      'résultats'],
  ['recommendations', 'recommandations'],
  ['technique',     'technique'],

  // Patient explanation
  ['radiologist',  'radiologue'],
  ['physician',    'médecin'],    ['doctor',    'médecin'],
  ['radiograph',   'radiographie'],
  ['ultrasound',   'échographie'],
  ['mammography',  'mammographie'],
  ['fluoroscopy',  'fluoroscopie'],
  ['report',       'compte-rendu'],
  ['diagnosis',    'diagnostic'],
  ['treatment',    'traitement'],
  ['urgent',       'urgent'],
  ['routine',      'routinier'],
  ['patient',      'patient'],
  ['results',      'résultats'],  ['result',    'résultat'],
  ['scan',         'examen'],
  ['imaging',      'imagerie'],
]

const DISCLAIMER_FR =
  'Cette explication vous aide à comprendre votre compte-rendu et ne remplace pas les conseils médicaux de votre médecin.'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Matches word boundaries including accented characters
function wordRe(word: string): RegExp {
  const esc = escapeRegex(word)
  return new RegExp(`(?<![a-zA-ZÀ-ÿ0-9])${esc}(?![a-zA-ZÀ-ÿ0-9])`, 'gi')
}

export function translateText(text: string, from: TranslationLang, to: TranslationLang): string {
  if (from === to || !text.trim()) return text

  const isEnToFr = from === 'en'

  let result = text

  // Apply phrase substitutions first (longest-first for correct greedy matching)
  for (const [en, fr] of PHRASE_PAIRS) {
    const [source, target] = isEnToFr ? [en, fr] : [fr, en]
    if (!source) continue
    result = result.replace(new RegExp(escapeRegex(source), 'gi'), target)
  }

  // Apply word substitutions with accented-aware word boundaries
  for (const [en, fr] of WORD_PAIRS) {
    const [source, target] = isEnToFr ? [en, fr] : [fr, en]
    if (!source) continue
    result = result.replace(wordRe(source), target)
  }

  return result
}

export function translateDisclaimer(from: TranslationLang, to: TranslationLang): string {
  if (from === 'en' && to === 'fr') return DISCLAIMER_FR
  if (from === 'fr' && to === 'en') {
    return 'This explanation is for understanding your report and does not replace medical advice from your doctor.'
  }
  return ''
}

export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  fr: 'French',
}
