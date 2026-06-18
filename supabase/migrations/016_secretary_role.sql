-- 016_secretary_role.sql
-- Adds a dedicated 'secretary' role for the vacation audio-queue workflow.
--
-- Secretaries upload/match audio, review transcription and obvious formatting,
-- and route reports to the radiologist. They MUST NEVER validate diagnoses or
-- sign reports — that authority is enforced both in the workflow state machine
-- (migration 017: enforce_vacation_validation_authority) and in the application
-- action layer (src/lib/actions/vacations.ts).
--
-- NOTE: this migration ONLY adds the enum value. It is intentionally separate
-- from 017 so the new label is committed before any policy or comparison in 017
-- references it (a freshly ADDed enum value cannot be used in the same
-- transaction that created it).

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'secretary';
