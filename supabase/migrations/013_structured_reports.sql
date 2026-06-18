-- 013_structured_reports.sql
-- Add structured JSON report data columns to support the HPD-format radiology report rebuild.
-- Run this in the Supabase SQL editor or via CLI: supabase db push

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS structured_data JSONB,
  ADD COLUMN IF NOT EXISTS exam_type       TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_exam_type ON reports (exam_type);

COMMENT ON COLUMN reports.structured_data IS
  'Structured HPD-format report content: { language, examType, examTitle, patient, indication, technique, results, conclusion, recommendations }';
COMMENT ON COLUMN reports.exam_type IS
  'Exam type key derived from modality + body part, e.g. scanner_cerebral, irm_rachis_lombaire';
