import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// R2.7A repair — a verification fixture must match the real schema.
//
// WHY THIS EXISTS
// The R2.7A verifier was written against a remembered `clinics` shape and
// omitted `slug` (NOT NULL since migration 001). It also inserted a `created_by`
// column into `reports`, which does not exist — the column is `author_id` — and
// omitted the NOT NULL `study_id` / `patient_id`.
//
// None of that was caught, because every check in `npm test` reads TypeScript
// and NOTHING read the .sql verification scripts. The failure surfaced only when
// an operator ran the script against production.
//
// So this test reads the migrations, derives each table's real column set and
// its genuinely required columns, and holds every INSERT in supabase/verify/
// against them. It cannot prove a script passes — only a real database can do
// that — but it makes "the fixture forgot a required column" impossible to ship
// again.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')
const VERIFY     = join(ROOT, 'supabase', 'verify')

/** column name → true when a value MUST be supplied (NOT NULL, no default). */
type Table = Map<string, boolean>
type Schema = Map<string, Table>

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '')

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

function buildSchema(): Schema {
  const schema: Schema = new Map()
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()

  for (const file of files) {
    const sql = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'))

    // ── CREATE TABLE public.x ( … );
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi
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

    // ── ALTER TABLE public.x … ;
    const alterRe = /alter\s+table\s+(?:only\s+)?public\.(\w+)([\s\S]*?);/gi
    for (const m of sql.matchAll(alterRe)) {
      const table = m[1].toLowerCase()
      const cols = schema.get(table)
      if (!cols) continue
      const body = m[2]

      for (const add of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)([^,;]*)/gi)) {
        const name = add[1].toLowerCase()
        const rest = add[2]
        const notNull = /\bnot\s+null\b/i.test(rest)
        const hasDefault = /\bdefault\b/i.test(rest)
        cols.set(name, notNull && !hasDefault)
      }
      // 044 relaxes transcriptions.vacation_item_id; honouring this is what
      // keeps the check free of false positives.
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

interface InsertSite {
  file: string
  table: string
  columns: string[]
}

function insertsIn(dir: string): InsertSite[] {
  const out: InsertSite[] = []
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const sql = stripComments(readFileSync(join(dir, file), 'utf8'))
    const re = /insert\s+into\s+(?:(\w+)\.)?(\w+)\s*\(([^)]*)\)/gi
    for (const m of sql.matchAll(re)) {
      const schemaName = (m[1] ?? 'public').toLowerCase()
      // auth.* and storage.* are Supabase-owned; our migrations do not define them.
      if (schemaName !== 'public') continue
      out.push({
        file,
        table: m[2].toLowerCase(),
        columns: m[3].split(',').map((c) => c.trim().replace(/"/g, '').toLowerCase()).filter(Boolean),
      })
    }
  }
  return out
}

const schema = buildSchema()
const sites  = insertsIn(VERIFY)

describe('the schema parser reflects the real migrations', () => {
  it('knows the tables the verifiers touch', () => {
    for (const t of ['clinics', 'reports', 'patients', 'studies', 'audio_assets', 'transcriptions']) {
      expect(schema.has(t), t).toBe(true)
    }
  })

  it('knows that clinics.slug is required and clinics.country is not', () => {
    const clinics = schema.get('clinics')!
    expect(clinics.get('slug')).toBe(true)      // NOT NULL, no default — the bug
    expect(clinics.get('name')).toBe(true)
    expect(clinics.get('country')).toBe(false)  // NOT NULL DEFAULT 'US'
    expect(clinics.get('status')).toBe(false)
    expect(clinics.get('id')).toBe(false)
  })

  it('knows reports has author_id and no created_by', () => {
    const reports = schema.get('reports')!
    expect(reports.get('author_id')).toBe(true)
    expect(reports.get('study_id')).toBe(true)
    expect(reports.get('patient_id')).toBe(true)
    expect(reports.has('created_by')).toBe(false)
    expect(reports.get('findings')).toBe(false)  // NOT NULL DEFAULT ''
  })

  it('honours a later migration relaxing a column', () => {
    // 044: transcriptions.vacation_item_id DROP NOT NULL (owner is now XOR).
    expect(schema.get('transcriptions')!.get('vacation_item_id')).toBe(false)
    expect(schema.get('transcriptions')!.get('clinic_id')).toBe(true)
  })

  it('picked up migration 045', () => {
    const runs = schema.get('transcription_runs')!
    expect(runs.get('clinic_id')).toBe(true)
    expect(runs.get('transcription_id')).toBe(true)
    expect(runs.get('audio_asset_id')).toBe(true)
    expect(runs.get('created_by')).toBe(true)
    expect(runs.get('status')).toBe(false)    // has a default
    expect(runs.get('raw_text')).toBe(false)  // has a default
  })
})

describe('every verification fixture matches the real schema', () => {
  it('finds INSERT sites to check', () => {
    expect(sites.length).toBeGreaterThan(0)
  })

  it('inserts no column that does not exist', () => {
    // This is what would have caught `reports.created_by`.
    const problems: string[] = []
    for (const site of sites) {
      const table = schema.get(site.table)
      if (!table) continue // not defined by our migrations
      for (const column of site.columns) {
        if (!table.has(column)) problems.push(`${site.file}: ${site.table}.${column} does not exist`)
      }
    }
    expect(problems).toEqual([])
  })

  it('supplies every required column', () => {
    // This is what would have caught `clinics.slug`.
    const problems: string[] = []
    for (const site of sites) {
      const table = schema.get(site.table)
      if (!table) continue
      for (const [column, required] of table) {
        if (required && !site.columns.includes(column)) {
          problems.push(`${site.file}: ${site.table}.${column} is NOT NULL with no default but was not supplied`)
        }
      }
    }
    expect(problems).toEqual([])
  })
})

describe('verification scripts stay safe to run', () => {
  const files = readdirSync(VERIFY).filter((f) => f.endsWith('.sql'))

  it('the R2.7A verifier is transaction-wrapped and rolls back', () => {
    const sql = readFileSync(join(VERIFY, 'R2_7A_transcription_runs.sql'), 'utf8')
    expect(sql).toMatch(/^\s*BEGIN;/m)
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(sql).not.toMatch(/^\s*COMMIT;/m)
  })

  it('every fixture UUID is hex-valid', () => {
    // 'v'/'i'/'s' are not hex and abort the whole script with 22P02 before any
    // assertion runs — the mistake that killed the R0.8A run.
    const bad: string[] = []
    for (const file of files) {
      const sql = readFileSync(join(VERIFY, file), 'utf8')
      for (const m of sql.matchAll(/'([0-9a-zA-Z]{8}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{12})'/g)) {
        if (!/^[0-9a-f-]+$/i.test(m[1]) || /[g-z]/i.test(m[1])) bad.push(`${file}: ${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('the R2.7A verifier borrows no real account', () => {
    // Statements, not prose: the file's own header explains the old mistake.
    const sql = stripComments(readFileSync(join(VERIFY, 'R2_7A_transcription_runs.sql'), 'utf8'))
    // An earlier revision did `SELECT id FROM auth.users LIMIT 1`, reaching into
    // a real account and giving no guarantee about its clinic.
    expect(sql).not.toMatch(/from\s+auth\.users\s+limit/i)
    expect(sql).toMatch(/INSERT INTO auth\.users/i)
  })

  it('no verifier prints clinical text, a token or a secret', () => {
    // Whole words: "secretary cannot validate" is a legitimate R0.8A notice and
    // must not be mistaken for a leaked secret.
    const forbidden = [/\braw_text\b/, /\btranscript\b/, /\bpassword\b/, /\bapi[_ ]?key\b/, /\bsecrets?\b/, /\btoken\b/]
    for (const file of files) {
      const sql = readFileSync(join(VERIFY, file), 'utf8')
      for (const notice of sql.matchAll(/raise\s+notice\s+'([^']*)'/gi)) {
        const text = notice[1].toLowerCase()
        for (const pattern of forbidden) {
          expect(text, `${file}: ${pattern}`).not.toMatch(pattern)
        }
      }
    }
  })
})
