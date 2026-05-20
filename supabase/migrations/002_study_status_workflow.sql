-- =============================================================================
-- Migration: Align study_status enum with clinical workflow
-- =============================================================================
-- Old values: pending, in_progress, completed, cancelled
-- New values: pending, in_review, reported, validated, cancelled
--
-- SAFE TO RUN if there are no existing rows in public.studies.
-- If rows exist, they will all be reset to 'pending' by the USING clause.
-- Run this in: Dashboard → SQL Editor
-- =============================================================================

-- Step 1: Drop the default so we can change the column type
alter table public.studies alter column status drop default;

-- Step 2: Temporarily cast to text so we can swap the underlying enum type
alter table public.studies alter column status type text;

-- Step 3: Drop the old enum (no longer referenced by any column)
drop type public.study_status;

-- Step 4: Create the new clinical-workflow enum
create type public.study_status as enum (
  'pending',    -- ordered, not yet assigned to a radiologist
  'in_review',  -- being actively reviewed / dictated by a radiologist
  'reported',   -- report drafted or finalized
  'validated',  -- report validated and signed off by a senior radiologist
  'cancelled'   -- study was cancelled or not performed
);

-- Step 5: Restore the column with the new type
-- USING 'pending' is safe because there are no rows, or you are OK resetting them.
alter table public.studies
  alter column status type public.study_status
  using 'pending'::public.study_status;

-- Step 6: Restore the default
alter table public.studies
  alter column status set default 'pending';
