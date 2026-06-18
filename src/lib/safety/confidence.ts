// Feature 10 — content-based confidence assessment.
//
// The structuring engine scores confidence at structuring time against the
// cleaned transcript. The signing gate needs confidence against the CURRENT,
// possibly radiologist-edited, report content — so that a radiologist resolves a
// low-confidence flag simply by writing adequate content. This keeps the gate
// deterministic and avoids perpetually-blocking stale flags.

import type { Confidence } from '@/types/structuring'

/**
 * Confidence of a single section's *final* text, by substance.
 * Empty or very short content is low (the engine never invents to fill it);
 * a sentence or two is medium; a substantial paragraph is high. Mirrors the
 * thresholds used by the structuring engine.
 */
export function assessConfidence(text: string): Confidence {
  const t = (text ?? '').trim()
  if (t.length >= 40) return 'high'
  if (t.length >= 15) return 'medium'
  return 'low'
}
