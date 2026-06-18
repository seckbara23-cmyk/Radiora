-- 014_user_preferences.sql
-- Adds infrastructure for the four-pillar radiologist preference learning system.
-- Run via Supabase SQL editor or CLI: supabase db push

-- ─── User phrase preferences ─────────────────────────────────────────────────
-- Stores radiologist-saved phrases per section + exam type.
-- SAFETY: the 'results' section (diagnostic findings) is intentionally excluded
-- from this system — it is enforced at the application layer, not here.

CREATE TABLE IF NOT EXISTS user_phrase_preferences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  clinic_id    UUID NOT NULL REFERENCES clinics(id)   ON DELETE CASCADE,
  exam_type    TEXT,                   -- NULL = applies to all exam types
  section      TEXT NOT NULL           CHECK (section IN ('technique', 'conclusion', 'indication', 'recommendations')),
  label        TEXT,                   -- user-given short name
  phrase_text  TEXT NOT NULL,
  use_count    INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_phrase_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own phrase preferences"
  ON user_phrase_preferences
  FOR ALL
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_pref_user_exam   ON user_phrase_preferences (user_id, exam_type);
CREATE INDEX IF NOT EXISTS idx_pref_user_section ON user_phrase_preferences (user_id, section);

-- ─── Personal templates ───────────────────────────────────────────────────────
-- Allow radiologists to create personal (per-user) templates alongside
-- clinic-wide templates.

ALTER TABLE report_templates
  ADD COLUMN IF NOT EXISTS is_personal        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS personal_author_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Personal templates are visible only to their author.
-- Update the existing RLS policies to allow personal template access.
-- (Add personal_author_id = auth.uid() to existing read policies.)
