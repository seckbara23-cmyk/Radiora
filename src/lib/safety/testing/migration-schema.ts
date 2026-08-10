// TEST SUPPORT — reads the migration files and reconstructs what the database
// actually looks like. Imported only by tests; nothing in the application
// imports it, so it is never bundled. A test asserts that.
//
// It exists because two production incidents came from code being written
// against a REMEMBERED schema:
//
//   • the R2.7A verifier omitted clinics.slug (NOT NULL since 001) and used
//     reports.created_by, a column that does not exist;
//   • migration 044 attached one trigger function to three tables and
//     dereferenced NEW.vacation_item_id, which audio_assets does not have.
//
// Both are statically decidable from the migrations. This module makes them so.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT  = fileURLToPath(new URL('../../../../', import.meta.url))
export const MIGRATIONS = join(REPO_ROOT, 'supabase', 'migrations')
export const VERIFY_DIR = join(REPO_ROOT, 'supabase', 'verify')

export const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, '')

/** column name → true when a value MUST be supplied (NOT NULL, no default). */
export type Table = Map<string, boolean>
export type Schema = Map<string, Table>

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
}

/** Split a CREATE TABLE body on top-level commas. */
function splitDefinitions(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of body) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += ch
  }
  if (current.trim()) parts.push(current)
  return parts
}

/** Table-level constraints are not columns. */
const CONSTRAINT_START = /^(unique|primary\s+key|foreign\s+key|check|constraint|exclude|like)\b/i

/**
 * Reconstruct every public table from the migrations, in order, honouring
 * later ADD COLUMN / DROP COLUMN and NOT NULL relaxations — 044 drops NOT NULL
 * on transcriptions.vacation_item_id, and missing that produces false alarms.
 */
export function buildSchema(): Schema {
  const schema: Schema = new Map()

  for (const file of migrationFiles()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS, file), 'utf8'))

    // The `public.` prefix is optional: 013 writes `ALTER TABLE reports` and
    // 014 `CREATE TABLE user_phrase_preferences`. The negative lookahead keeps
    // other schemas (storage.objects, auth.users) out.
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)(?!\.)\s*\(([\s\S]*?)\n\s*\)\s*;/gi
    for (const m of sql.matchAll(createRe)) {
      const table = m[1].toLowerCase()
      const cols: Table = schema.get(table) ?? new Map()
      for (const def of splitDefinitions(m[2])) {
        const line = def.trim()
        if (!line || CONSTRAINT_START.test(line)) continue
        const name = line.split(/\s+/)[0].replace(/"/g, '').toLowerCase()
        if (!/^\w+$/.test(name)) continue
        const notNull = /\bnot\s+null\b/i.test(line)
        const hasDefault = /\bdefault\b/i.test(line) || /\bgenerated\b/i.test(line)
        cols.set(name, notNull && !hasDefault)
      }
      schema.set(table, cols)
    }

    const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?(\w+)(?!\.)([\s\S]*?);/gi
    for (const m of sql.matchAll(alterRe)) {
      const cols = schema.get(m[1].toLowerCase())
      if (!cols) continue
      const body = m[2]
      for (const add of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)([^,;]*)/gi)) {
        const rest = add[2]
        cols.set(add[1].toLowerCase(), /\bnot\s+null\b/i.test(rest) && !/\bdefault\b/i.test(rest))
      }
      for (const drop of body.matchAll(/alter\s+column\s+(\w+)\s+drop\s+not\s+null/gi)) {
        cols.set(drop[1].toLowerCase(), false)
      }
      for (const set of body.matchAll(/alter\s+column\s+(\w+)\s+set\s+not\s+null/gi)) {
        const name = set[1].toLowerCase()
        if (cols.has(name)) cols.set(name, true)
      }
      for (const dropped of body.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi)) {
        cols.delete(dropped[1].toLowerCase())
      }
    }
  }

  return schema
}

// ─── Trigger topology ─────────────────────────────────────────────────────────

export interface TriggerBinding {
  trigger: string
  table: string
  fn: string
  file: string
}

/** Every `CREATE TRIGGER … ON public.x … EXECUTE FUNCTION public.f()`. */
export function triggerBindings(): TriggerBinding[] {
  const out: TriggerBinding[] = []
  for (const file of migrationFiles()) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS, file), 'utf8'))
    const re = /create\s+trigger\s+(\w+)[\s\S]*?\bon\s+public\.(\w+)[\s\S]*?execute\s+(?:function|procedure)\s+(?:public\.)?(\w+)\s*\(/gi
    for (const m of sql.matchAll(re)) {
      out.push({ trigger: m[1].toLowerCase(), table: m[2].toLowerCase(), fn: m[3].toLowerCase(), file })
    }
  }
  return out
}

/**
 * The FINAL body of each plpgsql function, i.e. the last `CREATE OR REPLACE`
 * across the migration sequence — which is what production ends up running.
 */
export function functionBodies(): Map<string, { body: string; file: string }> {
  const out = new Map<string, { body: string; file: string }>()
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\([^)]*\)[\s\S]*?\bas\s+(\$[a-z_]*\$)([\s\S]*?)\2/gi
    for (const m of sql.matchAll(re)) {
      out.set(m[1].toLowerCase(), { body: m[3], file })
    }
  }
  return out
}

/** Direct `NEW.<col>` / `OLD.<col>` record-field references in a body. */
export function recordFieldReferences(body: string): Set<string> {
  const found = new Set<string>()
  const code = stripSqlComments(body)
  for (const m of code.matchAll(/\b(?:new|old)\s*\.\s*(\w+)/gi)) found.add(m[1].toLowerCase())
  return found
}
