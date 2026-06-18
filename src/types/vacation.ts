import type { Modality } from './study'

export type VacationStatus = 'open' | 'closed'

/**
 * The 8-state queue lifecycle a report moves through during a vacation session.
 * Distinct from ReportStatus (draft|finalized|…) which governs clinical editing;
 * this drives the operational queue board.
 */
export type VacationWorkflowStatus =
  | 'audio_received'      // Audio reçu
  | 'transcribing'        // Transcription en cours
  | 'secretary_review'    // À relire secrétaire
  | 'radiologist_review'  // À valider radiologue
  | 'validated'           // Validé
  | 'signed'              // Signé
  | 'printed'             // Imprimé
  | 'exported'            // Exporté

export const VACATION_WORKFLOW_ORDER: VacationWorkflowStatus[] = [
  'audio_received',
  'transcribing',
  'secretary_review',
  'radiologist_review',
  'validated',
  'signed',
  'printed',
  'exported',
]

export interface Vacation {
  id:             string
  clinicId:       string
  radiologistId?: string
  title:          string
  modality:       Modality
  vacationDate:   string        // ISO date — YYYY-MM-DD
  status:         VacationStatus
  notes?:         string
  createdBy:      string
  createdAt:      string
  updatedAt:      string
}

export interface VacationItem {
  id:                     string
  clinicId:               string
  vacationId:             string
  patientId?:             string
  studyId?:               string
  reportId?:              string
  patientLabel?:          string
  examNumber?:            string
  position:               number
  workflowStatus:         VacationWorkflowStatus
  assignedSecretaryId?:   string
  assignedRadiologistId?: string
  createdBy:              string
  createdAt:              string
  updatedAt:              string
}

/** A vacation with a per-status item breakdown, for the sessions list. */
export interface VacationSummary extends Vacation {
  itemCount:    number
  statusCounts: Record<VacationWorkflowStatus, number>
  radiologistName?: string
}

/** A queue row joined with its patient + report context for the board. */
export interface VacationQueueItem extends VacationItem {
  vacationTitle:    string
  vacationModality: Modality
  vacationDate:     string
  patientName?:     string
  reportStatus?:    string
}

export interface ClinicRadiologist {
  id:        string
  firstName: string
  lastName:  string
}
