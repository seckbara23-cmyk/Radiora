import type { Clinic } from '@/types/clinic'
import type { User } from '@/types/user'
import type { Patient } from '@/types/patient'
import type { Study } from '@/types/study'
import type { Report } from '@/types/report'

// ─── Clinic ──────────────────────────────────────────────────────────────────

export const mockClinic: Clinic = {
  id: 'clinic-001',
  name: 'Metro Radiology Center',
  slug: 'metro-radiology',
  address: '1200 Medical Plaza Dr, Suite 400',
  city: 'Chicago',
  state: 'IL',
  country: 'US',
  phone: '+1 (312) 555-0100',
  email: 'admin@metro-radiology.com',
  status: 'active',
  plan: 'professional',
  userCount: 12,
  createdAt: '2025-01-15T08:00:00Z',
  updatedAt: '2026-05-01T09:30:00Z',
}

// ─── Users ───────────────────────────────────────────────────────────────────

export const mockUsers: User[] = [
  {
    id: 'user-001',
    clinicId: 'clinic-001',
    email: 'sarah.chen@metro-radiology.com',
    firstName: 'Sarah',
    lastName: 'Chen',
    role: 'radiologist',
    specialty: 'Neuroradiology',
    licenseNumber: 'IL-RAD-20183421',
    isActive: true,
    lastLoginAt: '2026-05-19T08:45:00Z',
    createdAt: '2025-01-15T08:00:00Z',
    updatedAt: '2026-05-19T08:45:00Z',
  },
  {
    id: 'user-002',
    clinicId: 'clinic-001',
    email: 'james.miller@metro-radiology.com',
    firstName: 'James',
    lastName: 'Miller',
    role: 'radiologist',
    specialty: 'Musculoskeletal Radiology',
    licenseNumber: 'IL-RAD-20191872',
    isActive: true,
    lastLoginAt: '2026-05-19T07:30:00Z',
    createdAt: '2025-01-15T08:00:00Z',
    updatedAt: '2026-05-19T07:30:00Z',
  },
  {
    id: 'user-003',
    clinicId: 'clinic-001',
    email: 'alex.thompson@metro-radiology.com',
    firstName: 'Alex',
    lastName: 'Thompson',
    role: 'technician',
    isActive: true,
    lastLoginAt: '2026-05-19T06:55:00Z',
    createdAt: '2025-03-01T08:00:00Z',
    updatedAt: '2026-05-19T06:55:00Z',
  },
  {
    id: 'user-004',
    clinicId: 'clinic-001',
    email: 'priya.patel@metro-radiology.com',
    firstName: 'Priya',
    lastName: 'Patel',
    role: 'clinic_admin',
    isActive: true,
    lastLoginAt: '2026-05-18T17:00:00Z',
    createdAt: '2025-01-15T08:00:00Z',
    updatedAt: '2026-05-18T17:00:00Z',
  },
  {
    id: 'user-005',
    clinicId: 'clinic-001',
    email: 'marcus.reid@external.com',
    firstName: 'Marcus',
    lastName: 'Reid',
    role: 'referring_physician',
    specialty: 'Internal Medicine',
    licenseNumber: 'IL-MD-19951104',
    isActive: true,
    lastLoginAt: '2026-05-17T11:20:00Z',
    createdAt: '2025-04-10T08:00:00Z',
    updatedAt: '2026-05-17T11:20:00Z',
  },
]

// ─── Patients ─────────────────────────────────────────────────────────────────

export const mockPatients: Patient[] = [
  {
    id: 'pat-001',
    mrn: 'MRN-100001',
    firstName: 'John',
    lastName: 'Smith',
    dateOfBirth: '1965-03-15',
    sex: 'male',
    email: 'john.smith@email.com',
    phone: '+1 (312) 555-0201',
    clinicId: 'clinic-001',
    status: 'active',
    createdAt: '2025-03-10T10:00:00Z',
    updatedAt: '2026-05-19T08:00:00Z',
  },
  {
    id: 'pat-002',
    mrn: 'MRN-100002',
    firstName: 'Mary',
    lastName: 'Johnson',
    dateOfBirth: '1978-08-22',
    sex: 'female',
    email: 'mary.johnson@email.com',
    phone: '+1 (312) 555-0302',
    clinicId: 'clinic-001',
    status: 'active',
    createdAt: '2025-06-20T10:00:00Z',
    updatedAt: '2026-05-19T09:00:00Z',
  },
  {
    id: 'pat-003',
    mrn: 'MRN-100003',
    firstName: 'Robert',
    lastName: 'Davis',
    dateOfBirth: '1952-11-08',
    sex: 'male',
    phone: '+1 (773) 555-0403',
    clinicId: 'clinic-001',
    status: 'active',
    createdAt: '2025-09-05T10:00:00Z',
    updatedAt: '2026-05-19T07:30:00Z',
  },
  {
    id: 'pat-004',
    mrn: 'MRN-100004',
    firstName: 'Emily',
    lastName: 'Chen',
    dateOfBirth: '1990-04-30',
    sex: 'female',
    email: 'emily.chen@email.com',
    phone: '+1 (312) 555-0504',
    clinicId: 'clinic-001',
    status: 'active',
    createdAt: '2026-01-12T10:00:00Z',
    updatedAt: '2026-05-17T14:00:00Z',
  },
  {
    id: 'pat-005',
    mrn: 'MRN-100005',
    firstName: 'Michael',
    lastName: 'Williams',
    dateOfBirth: '1943-07-19',
    sex: 'male',
    phone: '+1 (708) 555-0605',
    clinicId: 'clinic-001',
    status: 'active',
    createdAt: '2026-03-08T10:00:00Z',
    updatedAt: '2026-05-19T06:00:00Z',
  },
]

// ─── Studies ─────────────────────────────────────────────────────────────────

export const mockStudies: Study[] = [
  {
    id: 'study-001',
    accessionNumber: 'ACC-20260519-001',
    patientId: 'pat-001',
    clinicId: 'clinic-001',
    modality: 'CT',
    bodyPart: 'Chest',
    description: 'CT Chest with contrast — evaluation of pulmonary nodule',
    studyDate: '2026-05-19',
    referringPhysician: 'Dr. Marcus Reid',
    priority: 'routine',
    status: 'in_review',
    hasReport: false,
    createdAt: '2026-05-19T08:00:00Z',
    updatedAt: '2026-05-19T08:15:00Z',
  },
  {
    id: 'study-002',
    accessionNumber: 'ACC-20260519-002',
    patientId: 'pat-002',
    clinicId: 'clinic-001',
    modality: 'MRI',
    bodyPart: 'Brain',
    description: 'MRI Brain without contrast — headache and visual changes',
    studyDate: '2026-05-19',
    referringPhysician: 'Dr. Marcus Reid',
    priority: 'urgent',
    status: 'pending',
    hasReport: false,
    createdAt: '2026-05-19T09:00:00Z',
    updatedAt: '2026-05-19T09:00:00Z',
  },
  {
    id: 'study-003',
    accessionNumber: 'ACC-20260519-003',
    patientId: 'pat-003',
    clinicId: 'clinic-001',
    modality: 'XR',
    bodyPart: 'Chest',
    description: 'Chest X-Ray PA and Lateral — pre-op clearance',
    studyDate: '2026-05-19',
    referringPhysician: 'Dr. Lisa Nguyen',
    priority: 'routine',
    status: 'reported',
    hasReport: true,
    createdAt: '2026-05-19T07:30:00Z',
    updatedAt: '2026-05-19T07:55:00Z',
  },
  {
    id: 'study-004',
    accessionNumber: 'ACC-20260518-001',
    patientId: 'pat-004',
    clinicId: 'clinic-001',
    modality: 'CT',
    bodyPart: 'Abdomen & Pelvis',
    description: 'CT Abdomen/Pelvis with contrast — abdominal pain evaluation',
    studyDate: '2026-05-18',
    referringPhysician: 'Dr. Marcus Reid',
    priority: 'urgent',
    status: 'reported',
    hasReport: true,
    createdAt: '2026-05-18T11:00:00Z',
    updatedAt: '2026-05-18T13:30:00Z',
  },
  {
    id: 'study-005',
    accessionNumber: 'ACC-20260518-002',
    patientId: 'pat-005',
    clinicId: 'clinic-001',
    modality: 'MRI',
    bodyPart: 'Lumbar Spine',
    description: 'MRI Lumbar Spine without contrast — lower back pain and radiculopathy',
    studyDate: '2026-05-18',
    referringPhysician: 'Dr. Thomas Grant',
    priority: 'routine',
    status: 'reported',
    hasReport: false,
    createdAt: '2026-05-18T14:00:00Z',
    updatedAt: '2026-05-18T15:45:00Z',
  },
  {
    id: 'study-006',
    accessionNumber: 'ACC-20260517-001',
    patientId: 'pat-002',
    clinicId: 'clinic-001',
    modality: 'US',
    bodyPart: 'Abdomen',
    description: 'Ultrasound Abdomen — gallbladder evaluation',
    studyDate: '2026-05-17',
    referringPhysician: 'Dr. Marcus Reid',
    priority: 'routine',
    status: 'reported',
    hasReport: true,
    createdAt: '2026-05-17T10:00:00Z',
    updatedAt: '2026-05-17T11:00:00Z',
  },
  {
    id: 'study-007',
    accessionNumber: 'ACC-20260517-002',
    patientId: 'pat-001',
    clinicId: 'clinic-001',
    modality: 'MRI',
    bodyPart: 'Right Knee',
    description: 'MRI Right Knee without contrast — meniscal tear evaluation',
    studyDate: '2026-05-17',
    referringPhysician: 'Dr. Thomas Grant',
    priority: 'routine',
    status: 'reported',
    hasReport: true,
    createdAt: '2026-05-17T13:00:00Z',
    updatedAt: '2026-05-17T14:30:00Z',
  },
  {
    id: 'study-008',
    accessionNumber: 'ACC-20260514-001',
    patientId: 'pat-003',
    clinicId: 'clinic-001',
    modality: 'CT',
    bodyPart: 'Head',
    description: 'CT Head without contrast — acute change in mental status',
    studyDate: '2026-05-14',
    referringPhysician: 'Dr. Lisa Nguyen',
    priority: 'stat',
    status: 'cancelled',
    hasReport: false,
    createdAt: '2026-05-14T22:00:00Z',
    updatedAt: '2026-05-14T22:30:00Z',
  },
]

// ─── Reports ─────────────────────────────────────────────────────────────────

export const mockReports: Report[] = [
  {
    id: 'report-001',
    studyId: 'study-003',
    patientId: 'pat-003',
    clinicId: 'clinic-001',
    authorId: 'user-001',
    status: 'finalized',
    findings:
      'The lungs are clear bilaterally. No focal consolidation, pleural effusion, or pneumothorax. Cardiac silhouette is normal in size. No acute osseous abnormality.',
    impression: 'No acute cardiopulmonary process. Chest is clear for pre-operative purposes.',
    signedAt: '2026-05-19T08:10:00Z',
    createdAt: '2026-05-19T07:58:00Z',
    updatedAt: '2026-05-19T08:10:00Z',
  },
  {
    id: 'report-002',
    studyId: 'study-004',
    patientId: 'pat-004',
    clinicId: 'clinic-001',
    authorId: 'user-002',
    status: 'in_review',
    findings:
      'Mild thickening of the appendiceal wall measuring up to 8mm. Mild periappendiceal fat stranding. No free air or free fluid.',
    impression:
      'Findings are suspicious for early acute appendicitis. Clinical correlation recommended.',
    recommendations: 'Surgical consultation advised.',
    aiDraft:
      'AI-generated draft: Appendiceal wall thickening with periappendiceal inflammatory changes. Recommend surgical evaluation.',
    createdAt: '2026-05-18T13:45:00Z',
    updatedAt: '2026-05-18T15:00:00Z',
  },
  {
    id: 'report-003',
    studyId: 'study-006',
    patientId: 'pat-002',
    clinicId: 'clinic-001',
    authorId: 'user-001',
    status: 'finalized',
    findings:
      'The gallbladder is well-distended and contains multiple echogenic foci with posterior acoustic shadowing consistent with cholelithiasis. No gallbladder wall thickening or pericholecystic fluid. CBD measures 4mm.',
    impression: 'Cholelithiasis without sonographic evidence of acute cholecystitis.',
    signedAt: '2026-05-17T11:30:00Z',
    createdAt: '2026-05-17T11:05:00Z',
    updatedAt: '2026-05-17T11:30:00Z',
  },
  {
    id: 'report-004',
    studyId: 'study-007',
    patientId: 'pat-001',
    clinicId: 'clinic-001',
    authorId: 'user-002',
    status: 'finalized',
    findings:
      'Tear of the posterior horn of the medial meniscus with vertical component. Moderate joint effusion. Intact cruciate and collateral ligaments. No bone bruise or fracture.',
    impression: 'Posterior horn medial meniscal tear. Moderate knee effusion.',
    recommendations: 'Orthopedic referral for surgical evaluation.',
    signedAt: '2026-05-17T14:45:00Z',
    createdAt: '2026-05-17T14:00:00Z',
    updatedAt: '2026-05-17T14:45:00Z',
  },
  {
    id: 'report-005',
    studyId: 'study-005',
    patientId: 'pat-005',
    clinicId: 'clinic-001',
    authorId: 'user-001',
    status: 'draft',
    findings: '',
    impression: '',
    aiDraft:
      'AI-generated draft: Multilevel degenerative disc disease most pronounced at L4-L5 and L5-S1. Left paracentral disc protrusion at L4-L5 with moderate left neural foraminal narrowing. Findings may correlate with reported left lower extremity radiculopathy.',
    createdAt: '2026-05-18T16:00:00Z',
    updatedAt: '2026-05-18T16:00:00Z',
  },
]

// ─── Activity feed ────────────────────────────────────────────────────────────

export type ActivityType =
  | 'report_finalized'
  | 'report_drafted'
  | 'study_uploaded'
  | 'study_completed'
  | 'patient_added'

export interface ActivityItem {
  id: string
  type: ActivityType
  description: string
  user: string
  timeAgo: string
}

export const mockActivity: ActivityItem[] = [
  {
    id: 'act-001',
    type: 'report_finalized',
    description: 'Report finalized for Robert Davis (Chest X-Ray)',
    user: 'Dr. Sarah Chen',
    timeAgo: '8 minutes ago',
  },
  {
    id: 'act-002',
    type: 'study_uploaded',
    description: 'MRI Brain study uploaded for Mary Johnson',
    user: 'Alex Thompson',
    timeAgo: '1 hour ago',
  },
  {
    id: 'act-003',
    type: 'report_drafted',
    description: 'AI draft generated for MRI Lumbar Spine — Michael Williams',
    user: 'System',
    timeAgo: '2 hours ago',
  },
  {
    id: 'act-004',
    type: 'report_finalized',
    description: 'Report finalized for John Smith (Right Knee MRI)',
    user: 'Dr. James Miller',
    timeAgo: '3 hours ago',
  },
  {
    id: 'act-005',
    type: 'study_completed',
    description: 'CT Abdomen/Pelvis completed for Emily Chen',
    user: 'Alex Thompson',
    timeAgo: 'Yesterday, 1:30 PM',
  },
  {
    id: 'act-006',
    type: 'patient_added',
    description: 'New patient Michael Williams registered',
    user: 'Priya Patel',
    timeAgo: 'Yesterday, 10:00 AM',
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const patientMap = Object.fromEntries(
  mockPatients.map((p) => [p.id, `${p.firstName} ${p.lastName}`])
)

export const userMap = Object.fromEntries(
  mockUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`])
)

export const studyMap = Object.fromEntries(
  mockStudies.map((s) => [s.id, s])
)

// Derived KPI values
export const kpi = {
  totalPatients: mockPatients.length,
  studiesToday: mockStudies.filter((s) => s.studyDate === '2026-05-19').length,
  pendingReports: mockStudies.filter((s) => s.status === 'reported' && !s.hasReport).length
    + mockReports.filter((r) => r.status === 'draft' || r.status === 'in_review').length,
  finalizedThisWeek: mockReports.filter((r) => r.status === 'finalized').length,
}
