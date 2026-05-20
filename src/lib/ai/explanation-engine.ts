export interface ExplanationInput {
  findings:        string
  impression:      string
  recommendations: string
  modality:        string | null
  bodyPart:        string | null
}

// Medical term → plain English substitutions applied to the report text
const TERM_MAP: Record<string, string> = {
  // anatomy
  'pulmonary':           'lung',
  'cardiac':             'heart',
  'hepatic':             'liver',
  'renal':               'kidney',
  'cerebral':            'brain',
  'osseous':             'bone',
  'vascular':            'blood vessel',
  'pleural':             'around the lung',
  'myocardial':          'heart muscle',
  'interstitial':        'in the lung tissue',
  'parenchymal':         'tissue',
  'parenchyma':          'tissue',
  'cortical':            'outer layer',
  'subcutaneous':        'under the skin',

  // conditions
  'pneumonia':           'lung infection',
  'consolidation':       'area of cloudiness in the lung',
  'pneumothorax':        'collapsed lung',
  'atelectasis':         'partial collapse of lung tissue',
  'effusion':            'fluid buildup',
  'edema':               'swelling',
  'stenosis':            'narrowing',
  'occlusion':           'blockage',
  'contusion':           'bruise',
  'laceration':          'tear',
  'hematoma':            'blood collection',
  'calcification':       'calcium deposit',
  'cardiomegaly':        'enlarged heart',
  'spondylosis':         'spinal wear and tear',
  'spondylolisthesis':   'slipped spinal bone',
  'herniation':          'tissue that has bulged out of place',
  'lymphadenopathy':     'swollen lymph nodes',
  'adenopathy':          'swollen lymph nodes',
  'neoplasm':            'abnormal growth',
  'lesion':              'area of concern',
  'nodule':              'small rounded area',
  'mass':                'growth',
  'fracture':            'break',

  // descriptors
  'bilateral':           'on both sides',
  'unilateral':          'on one side',
  'posterior':           'back',
  'anterior':            'front',
  'superior':            'upper',
  'inferior':            'lower',
  'lateral':             'side',
  'medial':              'inner',
  'proximal':            'closer to the body',
  'distal':              'further from the body',
  'acute':               'sudden',
  'chronic':             'long-lasting',
  'diffuse':             'widespread',
  'focal':               'in one spot',

  // common phrases
  'unremarkable':                'normal in appearance',
  'within normal limits':        'normal',
  'no acute findings':           'nothing urgent was found',
  'no acute abnormality':        'nothing urgent was found',
  'no significant':              'no notable',
  'interval change':             'change since the last scan',
}

const MODALITY_LABELS: Record<string, string> = {
  CT:  'CT scan',
  MRI: 'MRI scan',
  XR:  'X-ray',
  CR:  'X-ray',
  US:  'ultrasound scan',
  PET: 'PET scan',
  NM:  'nuclear medicine scan',
  MG:  'mammogram',
  DX:  'X-ray',
  RF:  'fluoroscopy scan',
}

function applySubs(text: string): string {
  let result = text
  for (const [medical, plain] of Object.entries(TERM_MAP)) {
    // Word-boundary match, case-insensitive, non-global so we build new regex each time
    result = result.replace(new RegExp(`\\b${medical}\\b`, 'gi'), plain)
  }
  return result
}

function scanLabel(modality: string | null, bodyPart: string | null): string {
  const mod  = MODALITY_LABELS[modality?.toUpperCase() ?? ''] ?? 'imaging scan'
  const body = bodyPart ? ` of your ${bodyPart.toLowerCase()}` : ''
  return `${mod}${body}`
}

export function generateExplanationText(input: ExplanationInput): string {
  const { findings, impression, recommendations, modality, bodyPart } = input
  const scan = scanLabel(modality, bodyPart)
  const lines: string[] = []

  lines.push(`Your ${scan} has been reviewed by a radiologist.`)
  lines.push('')

  const simpleImpression = applySubs(impression).trim()
  if (simpleImpression) {
    lines.push(`What the scan showed:`)
    lines.push(simpleImpression)
    lines.push('')
  }

  const simpleFindings = applySubs(findings).trim()
  if (simpleFindings) {
    lines.push(`Details from the scan:`)
    lines.push(simpleFindings)
    lines.push('')
  }

  const simpleRecs = applySubs(recommendations).trim()
  if (simpleRecs) {
    lines.push(`What happens next:`)
    lines.push(simpleRecs)
  }

  return lines.join('\n').trim()
}

export const STANDARD_DISCLAIMER =
  'This explanation is for understanding your report and does not replace medical advice from your doctor.'
