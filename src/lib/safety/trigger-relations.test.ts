import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildSchema,
  triggerBindings,
  functionBodies,
  recordFieldReferences,
  REPO_ROOT,
} from '@/lib/safety/testing/migration-schema'

// R2.7B — a shared trigger function must be safe on EVERY relation it is
// attached to.
//
// THE INCIDENT THIS ENCODES
// Migration 044 attached one function to three tables with different ownership
// columns and wrote:
//
//     if to_jsonb(new) ? 'vacation_item_id' and new.vacation_item_id is not null
//
// The left-hand guard cannot protect the right-hand side. PL/pgSQL hands each
// expression to the SQL planner, and `new.vacation_item_id` is resolved against
// the trigger relation's row type at PLAN time — so on `audio_assets`, which
// has no such column, the expression fails to plan:
//
//     ERROR 42703: record "new" has no field "vacation_item_id"
//
// AND short-circuiting is a runtime property; an expression that cannot be
// planned never reaches runtime. CREATE FUNCTION does not validate a plpgsql
// body against any particular relation, so this deployed cleanly and stayed
// dormant until something inserted into audio_assets.
//
// It is statically decidable, so it is decided here.

const schema   = buildSchema()
const bindings = triggerBindings()
const bodies   = functionBodies()

describe('the trigger topology is readable from the migrations', () => {
  it('finds triggers and their functions', () => {
    expect(bindings.length).toBeGreaterThan(0)
    const owner = bindings.filter((b) => b.fn === 'enforce_dictation_owner_clinic')
    expect(owner.map((b) => b.table).sort()).toEqual(
      // 044 attached it to three tables; 046 re-asserts the same three.
      ['audio_assets', 'audio_assets', 'dictation_sessions', 'dictation_sessions',
       'transcriptions', 'transcriptions'],
    )
  })

  it('reads the FINAL body of a function that was replaced later', () => {
    const fn = bodies.get('enforce_dictation_owner_clinic')
    expect(fn).toBeDefined()
    // 046 is the last definition, so that is what production runs.
    expect(fn!.file).toBe('046_owner_clinic_trigger_fix.sql')
  })
})

describe('no trigger dereferences a column absent from one of its relations', () => {
  it('every NEW.<column> exists on every attached relation', () => {
    const problems: string[] = []

    // Which relations does each trigger function serve?
    const relationsByFn = new Map<string, Set<string>>()
    for (const b of bindings) {
      const set = relationsByFn.get(b.fn) ?? new Set<string>()
      set.add(b.table)
      relationsByFn.set(b.fn, set)
    }

    for (const [fn, relations] of relationsByFn) {
      const entry = bodies.get(fn)
      if (!entry) continue // defined outside the migrations we parse
      for (const column of recordFieldReferences(entry.body)) {
        for (const relation of relations) {
          const table = schema.get(relation)
          if (!table) continue
          if (!table.has(column)) {
            problems.push(
              `${fn}() dereferences NEW.${column}, but public.${relation} has no such column ` +
              `(would raise 42703 when the trigger fires on ${relation})`,
            )
          }
        }
      }
    }

    expect(problems).toEqual([])
  })

  it('the owner-clinic function reads ownership through jsonb, not field access', () => {
    const body = bodies.get('enforce_dictation_owner_clinic')!.body
    // `->>` on an absent key yields NULL at runtime for any row type; a field
    // reference cannot be made safe by any guard placed beside it.
    expect(body).toMatch(/to_jsonb\(new\)/i)
    for (const column of ['report_id', 'vacation_item_id', 'vacation_id']) {
      expect(body, `NEW.${column}`).not.toMatch(new RegExp(`\\bnew\\s*\\.\\s*${column}\\b`, 'i'))
      expect(body, `jsonb read of ${column}`).toMatch(new RegExp(`->>\\s*'${column}'`, 'i'))
    }
  })

  it('the discredited short-circuit guard is gone', () => {
    const body = bodies.get('enforce_dictation_owner_clinic')!.body
    expect(body).not.toMatch(/\?\s*'vacation_item_id'\s*and\s+new\s*\./i)
  })
})

describe('the ownership contracts from 044 are intact', () => {
  const sql = readdirSync(join(REPO_ROOT, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(REPO_ROOT, 'supabase', 'migrations', f), 'utf8'))
    .join('\n')

  it('the three tables keep the columns R2.2 defined', () => {
    expect(schema.get('dictation_sessions')!.has('vacation_item_id')).toBe(true)
    expect(schema.get('dictation_sessions')!.has('report_id')).toBe(true)

    expect(schema.get('transcriptions')!.has('vacation_item_id')).toBe(true)
    expect(schema.get('transcriptions')!.has('report_id')).toBe(true)

    // The heart of the incident: audio_assets' queue link is vacation_id.
    expect(schema.get('audio_assets')!.has('vacation_id')).toBe(true)
    expect(schema.get('audio_assets')!.has('report_id')).toBe(true)
    expect(schema.get('audio_assets')!.has('vacation_item_id')).toBe(false)
  })

  it('XOR / NAND remain CHECK constraints, not trigger logic', () => {
    expect(sql).toMatch(/dictation_sessions_one_owner[\s\S]{0,120}num_nonnulls\(vacation_item_id,\s*report_id\)\s*=\s*1/)
    expect(sql).toMatch(/transcriptions_one_owner[\s\S]{0,120}num_nonnulls\(vacation_item_id,\s*report_id\)\s*=\s*1/)
    expect(sql).toMatch(/audio_assets_single_owner[\s\S]{0,120}num_nonnulls\(vacation_id,\s*report_id\)\s*<=\s*1/)
  })

  it('046 adds, renames and drops no column', () => {
    const m046 = readFileSync(
      join(REPO_ROOT, 'supabase', 'migrations', '046_owner_clinic_trigger_fix.sql'), 'utf8',
    )
    for (const forbidden of [/add\s+column/i, /drop\s+column/i, /rename\s+column/i, /alter\s+column/i]) {
      expect(m046, String(forbidden)).not.toMatch(forbidden)
    }
    // …and does not touch RLS.
    expect(m046).not.toMatch(/create\s+policy|drop\s+policy|disable\s+row\s+level/i)
  })

  it('046 is forward-only — 001-045 are untouched by it', () => {
    const files = readdirSync(join(REPO_ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'))
    expect(files).toContain('046_owner_clinic_trigger_fix.sql')
    expect(files.filter((f) => /^04[0-6]/.test(f)).sort()).toEqual([
      '040_delivery_hardening.sql', '041_vacation_authority_fix.sql', '042_clinical_authority.sql',
      '043_delivery_expiry_enforced.sql', '044_report_linked_dictation.sql',
      '045_transcription_runs.sql', '046_owner_clinic_trigger_fix.sql',
    ])
  })
})

describe('the repair is exercised for real, not only statically', () => {
  const verify = readFileSync(
    join(REPO_ROOT, 'supabase', 'verify', 'R2_7B_owner_clinic_trigger.sql'), 'utf8',
  )

  it('inserts into all three attached relations', () => {
    for (const table of ['audio_assets', 'dictation_sessions', 'transcriptions']) {
      expect(verify, table).toMatch(new RegExp(`INSERT INTO public\\.${table}`, 'i'))
    }
  })

  it('covers every owner variant the architecture allows', () => {
    // audio_assets: unassigned / report / vacation / both / cross-clinic ×2
    expect(verify).toMatch(/unassigned audio asset accepted/)
    expect(verify).toMatch(/report-owned audio asset accepted/)
    expect(verify).toMatch(/vacation-owned audio asset accepted/)
    expect(verify).toMatch(/audio asset with both owners rejected/)
    expect(verify).toMatch(/cross-clinic report-owned audio rejected/)
    expect(verify).toMatch(/cross-clinic vacation-owned audio rejected/)
    // sessions + transcriptions, both owners, both cross-clinic directions
    expect(verify).toMatch(/cross-clinic report session rejected/)
    expect(verify).toMatch(/cross-clinic queue session rejected/)
    expect(verify).toMatch(/cross-clinic report transcription rejected/)
    expect(verify).toMatch(/cross-clinic queue transcription rejected/)
  })

  it('exercises UPDATE, not only INSERT', () => {
    // R2.7A sets audio_assets.status = 'transcribed'; the guard fires there too.
    expect(verify).toMatch(/UPDATE public\.audio_assets SET status/i)
    expect(verify).toMatch(/cross-clinic re-owning UPDATE rejected/)
  })

  it('rolls back and prints nothing sensitive', () => {
    expect(verify).toMatch(/^\s*BEGIN;/m)
    expect(verify.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(verify).not.toMatch(/^\s*COMMIT;/m)
  })
})

describe('the test-support parser stays out of the application', () => {
  it('no production module imports it', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, out)
        else out.push(full)
      }
      return out
    }
    const src = join(REPO_ROOT, 'src')
    const offenders = walk(src)
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => !f.includes(join('safety', 'testing')))
      .filter((f) => readFileSync(f, 'utf8').includes('safety/testing/migration-schema'))
    expect(offenders).toEqual([])
  })
})
