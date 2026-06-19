import { describe, it, expect } from 'vitest'
import {
  reportsPerDay,
  countInMonth,
  averageSpanMinutes,
  roundedMean,
  summariseDictation,
  secretaryProductivity,
} from './clinic-metrics'

describe('reportsPerDay', () => {
  it('zero-fills a continuous, chronological window ending on now', () => {
    const series = reportsPerDay([], '2026-06-19T10:00:00.000Z', 3)
    expect(series.map((d) => d.date)).toEqual(['2026-06-17', '2026-06-18', '2026-06-19'])
    expect(series.every((d) => d.count === 0)).toBe(true)
  })

  it('buckets timestamps by UTC day', () => {
    const series = reportsPerDay(
      [
        '2026-06-19T08:00:00.000Z',
        '2026-06-19T23:59:00.000Z',
        '2026-06-18T01:00:00.000Z',
      ],
      '2026-06-19T10:00:00.000Z',
      3,
    )
    const byDate = Object.fromEntries(series.map((d) => [d.date, d.count]))
    expect(byDate['2026-06-19']).toBe(2)
    expect(byDate['2026-06-18']).toBe(1)
    expect(byDate['2026-06-17']).toBe(0)
  })

  it('excludes timestamps outside the window', () => {
    const series = reportsPerDay(
      ['2026-06-10T08:00:00.000Z', '2026-07-01T08:00:00.000Z'],
      '2026-06-19T10:00:00.000Z',
      3,
    )
    expect(series.reduce((a, d) => a + d.count, 0)).toBe(0)
  })
})

describe('countInMonth', () => {
  it('counts only same-UTC-month timestamps', () => {
    const n = countInMonth(
      ['2026-06-01T00:00:00Z', '2026-06-30T23:00:00Z', '2026-05-31T23:00:00Z', '2026-07-01T00:00:00Z'],
      '2026-06-19T10:00:00.000Z',
    )
    expect(n).toBe(2)
  })
})

describe('roundedMean', () => {
  it('returns 0 for an empty list', () => {
    expect(roundedMean([])).toBe(0)
  })
  it('rounds to the nearest integer', () => {
    expect(roundedMean([10, 11])).toBe(11) // 10.5 → 11
    expect(roundedMean([1, 2, 4])).toBe(2) // 2.33 → 2
  })
})

describe('averageSpanMinutes', () => {
  it('averages positive spans and counts them', () => {
    const res = averageSpanMinutes([
      { start: '2026-06-19T10:00:00Z', end: '2026-06-19T10:30:00Z' }, // 30m
      { start: '2026-06-19T10:00:00Z', end: '2026-06-19T11:30:00Z' }, // 90m
    ])
    expect(res).toEqual({ avgMinutes: 60, count: 2 })
  })

  it('skips missing, unparseable and non-positive spans', () => {
    const res = averageSpanMinutes([
      { start: '2026-06-19T10:00:00Z', end: '' },
      { start: 'nope', end: '2026-06-19T11:00:00Z' },
      { start: '2026-06-19T11:00:00Z', end: '2026-06-19T10:00:00Z' }, // negative
      { start: '2026-06-19T10:00:00Z', end: '2026-06-19T10:20:00Z' }, // 20m
    ])
    expect(res).toEqual({ avgMinutes: 20, count: 1 })
  })

  it('returns zero when nothing valid', () => {
    expect(averageSpanMinutes([])).toEqual({ avgMinutes: 0, count: 0 })
  })
})

describe('summariseDictation', () => {
  it('counts every session but only sums positive durations', () => {
    const vol = summariseDictation([120, 240, null, 0, undefined])
    expect(vol.sessions).toBe(5)
    expect(vol.totalSeconds).toBe(360)
    expect(vol.avgSeconds).toBe(180)
  })

  it('handles an empty list', () => {
    expect(summariseDictation([])).toEqual({ sessions: 0, totalSeconds: 0, avgSeconds: 0 })
  })
})

describe('secretaryProductivity', () => {
  it('tallies events per secretary and keeps zero-activity ones', () => {
    const rows = secretaryProductivity(
      [
        { userId: 'a', firstName: 'Awa', lastName: 'Ba' },
        { userId: 'b', firstName: 'Bintou', lastName: 'Sow' },
      ],
      [{ userId: 'a' }, { userId: 'a' }, { userId: 'b' }, { userId: null }, { userId: 'unknown' }],
    )
    expect(rows[0]).toMatchObject({ userId: 'a', actions: 2 })
    expect(rows[1]).toMatchObject({ userId: 'b', actions: 1 })
  })

  it('sorts busiest first', () => {
    const rows = secretaryProductivity(
      [
        { userId: 'quiet', firstName: 'Q', lastName: '' },
        { userId: 'busy', firstName: 'B', lastName: '' },
      ],
      [{ userId: 'busy' }, { userId: 'busy' }],
    )
    expect(rows.map((r) => r.userId)).toEqual(['busy', 'quiet'])
  })
})
