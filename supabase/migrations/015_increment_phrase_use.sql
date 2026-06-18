-- 015_increment_phrase_use.sql
-- Secure RPC that backs the "most-used first" ordering of saved phrase
-- suggestions. Called from src/lib/actions/preferences.ts (incrementPhraseUse)
-- whenever a radiologist applies a saved phrase.
--
-- Security model:
--   * Signature is increment_phrase_use(phrase_id uuid) ONLY. The owning user is
--     derived server-side from auth.uid() — a client-supplied user id is never
--     trusted.
--   * The row is matched on user_id = auth.uid() so a user can only ever bump the
--     counter on a phrase they own.
--   * Tenant scope is additionally enforced via public.get_current_user_clinic_id()
--     so the update also stays within the caller's clinic.
--   * SECURITY INVOKER (the default) is used deliberately. The
--     user_phrase_preferences RLS policy already restricts every row operation to
--     user_id = auth.uid(), so the function needs no elevated privileges — running
--     as the caller keeps RLS in force as a second line of defence. SECURITY
--     DEFINER would only be justified if we needed to bypass RLS, which we do not.
--   * search_path is locked to '' and all objects are schema-qualified, so the
--     function cannot be hijacked by a malicious search_path.
--
-- Idempotent: CREATE OR REPLACE FUNCTION.

CREATE OR REPLACE FUNCTION public.increment_phrase_use(phrase_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.user_phrase_preferences AS p
     SET use_count  = p.use_count + 1,
         updated_at = pg_catalog.now()
   WHERE p.id        = phrase_id
     AND p.user_id   = auth.uid()
     AND p.clinic_id = public.get_current_user_clinic_id()
  RETURNING p.use_count;
$$;

COMMENT ON FUNCTION public.increment_phrase_use(uuid) IS
  'Increments use_count for a phrase preference owned by the authenticated caller '
  '(scoped to their clinic). Returns the new count, or NULL if no such owned row.';

-- Lock down execution: only authenticated users may call it. anon has no
-- auth.uid() and would no-op anyway, but we deny it explicitly.
REVOKE ALL    ON FUNCTION public.increment_phrase_use(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_phrase_use(uuid) TO authenticated;


-- ─── Structural verification (runs at migration time, as the migration role) ───
-- Asserts the function exists with the intended security properties. Safe to run
-- in any context (does not depend on auth.uid()).
DO $$
DECLARE
  v_secdef  boolean;
  v_config  text[];
BEGIN
  SELECT p.prosecdef, p.proconfig
    INTO v_secdef, v_config
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'increment_phrase_use'
     AND pg_catalog.pg_get_function_identity_arguments(p.oid) = 'phrase_id uuid';

  IF v_secdef IS NULL THEN
    RAISE EXCEPTION 'increment_phrase_use(uuid) was not created';
  END IF;

  IF v_secdef THEN
    RAISE EXCEPTION 'increment_phrase_use must be SECURITY INVOKER, found SECURITY DEFINER';
  END IF;

  -- proconfig entries look like 'search_path=...'; confirm one is present.
  IF v_config IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(v_config) AS c WHERE c LIKE 'search_path=%'
  ) THEN
    RAISE EXCEPTION 'increment_phrase_use must have a locked search_path';
  END IF;

  RAISE NOTICE 'increment_phrase_use(uuid): SECURITY INVOKER + locked search_path OK';
END;
$$;


-- ─── Runtime verification queries (run manually in the Supabase SQL editor while
--     authenticated as a real radiologist; left commented so the migration itself
--     does not depend on an auth context) ────────────────────────────────────────
--
-- 1. Bump one of your own phrases and observe the returned new count:
--      select public.increment_phrase_use('<your-phrase-id>'::uuid);   -- returns N+1
--
-- 2. Confirm it persisted:
--      select id, use_count, updated_at
--        from public.user_phrase_preferences
--       where id = '<your-phrase-id>'::uuid;
--
-- 3. Attempt to bump a phrase you do NOT own — must return NULL and change nothing:
--      select public.increment_phrase_use('<someone-elses-phrase-id>'::uuid);  -- NULL
--
-- 4. Attempt a non-existent id — must return NULL:
--      select public.increment_phrase_use('00000000-0000-0000-0000-000000000000'::uuid);
