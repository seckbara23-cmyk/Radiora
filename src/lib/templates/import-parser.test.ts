import { describe, it, expect } from 'vitest'
import { parseTemplateDocument } from './import-parser'

const SCAN = `SCANNER CEREBRAL

INDICATION:

TECHNIQUE : acquisition hélicoïdale sans injection de contraste. DLP= …… mGy/cm

RESULTATS :

Absence d’anomalie de densité du parenchyme ou de collection péri cérébrale.
Structures médianes en place.

EN CONCLUSION :

Scanner cérébral normal.

Dr ABIBOU BA

SCANNER THORAX

INDICATION:

TECHNIQUE : acquisition hélicoïdale sans injection de contraste. DLP= mGy/cm

RESULTATS :

Aspect normal de l’arbre trachéo-bronchique.

CONCLUSION :

TDM thoracique normale

Dr ABIBOU BA`

const ECHO = `ECHOGRAPHIE ABDOMINALE

INDICATION :

RESULTATS :

Foie de taille normale.

CONCLUSION :

Examen normal ce jour.

Dr ABIBOU BA`

describe('parseTemplateDocument', () => {
  it('splits multiple templates on the signature line', () => {
    const out = parseTemplateDocument(SCAN)
    expect(out).toHaveLength(2)
    expect(out[0].title).toBe('SCANNER CEREBRAL')
    expect(out[1].title).toBe('SCANNER THORAX')
  })

  it('captures the four sections with inline technique', () => {
    const [cerebral] = parseTemplateDocument(SCAN)
    expect(cerebral.indication).toBe('')
    expect(cerebral.technique).toContain('acquisition hélicoïdale sans injection')
    expect(cerebral.results).toContain('Structures médianes en place.')
    expect(cerebral.conclusion).toBe('Scanner cérébral normal.')
  })

  it('treats "EN CONCLUSION" and "CONCLUSION" the same', () => {
    const [, thorax] = parseTemplateDocument(SCAN)
    expect(thorax.conclusion).toBe('TDM thoracique normale')
  })

  it('strips the signature from content but exposes it', () => {
    const [cerebral] = parseTemplateDocument(SCAN)
    expect(cerebral.signature).toBe('Dr ABIBOU BA')
    expect(cerebral.results).not.toContain('ABIBOU')
    expect(cerebral.conclusion).not.toContain('ABIBOU')
  })

  it('handles echo templates that have no TECHNIQUE section', () => {
    const [echo] = parseTemplateDocument(ECHO)
    expect(echo.title).toBe('ECHOGRAPHIE ABDOMINALE')
    expect(echo.technique).toBe('')
    expect(echo.results).toBe('Foie de taille normale.')
    expect(echo.conclusion).toBe('Examen normal ce jour.')
  })

  it('preserves multi-line results in order', () => {
    const [cerebral] = parseTemplateDocument(SCAN)
    expect(cerebral.results.split('\n')).toEqual([
      'Absence d’anomalie de densité du parenchyme ou de collection péri cérébrale.',
      'Structures médianes en place.',
    ])
  })

  it('parses a single pasted template without a signature', () => {
    const single = `IRM DU GENOU\n\nINDICATION : douleur\n\nRESULTATS :\n\nPas d'épanchement.\n\nCONCLUSION :\n\nIRM normale.`
    const out = parseTemplateDocument(single)
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('IRM DU GENOU')
    expect(out[0].indication).toBe('douleur')
    expect(out[0].conclusion).toBe('IRM normale.')
  })

  it('ignores empty input', () => {
    expect(parseTemplateDocument('')).toEqual([])
    expect(parseTemplateDocument('\n\n  \n')).toEqual([])
  })
})
