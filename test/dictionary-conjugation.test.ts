import { describe, it, expect } from 'vitest'
import { buildConjugation } from '@/lib/dictionary/conjugation'
import type { WordForm } from '@/lib/dictionary/types'

// Real lex.inflections labels for the Spanish verb "hablar" (a representative subset,
// taken verbatim from the database). The data mixes two labelling vocabularies — a
// clean Spanish one (`indicativo presente yo`) and a noisy English one
// (`indicative present singular third-person`) — plus clitic-combined forms and
// obsolete variants. The parser must use the Spanish vocabulary and ignore the rest.
const HABLAR: WordForm[] = [
  { formText: 'hablar', formLabel: 'infinitivo infinitivo' },
  { formText: 'hablando', formLabel: 'gerundio gerundio' },
  { formText: 'hablado', formLabel: 'participo participo' },
  { formText: 'hablada', formLabel: 'feminine participle past singular' },
  { formText: 'hablados', formLabel: 'masculine participle past plural' },
  // indicative present
  { formText: 'hablo', formLabel: 'indicativo presente yo' },
  { formText: 'hablas', formLabel: 'indicativo presente tú' },
  { formText: 'habla', formLabel: 'indicativo presente él' },
  { formText: 'habla', formLabel: 'indicativo presente ella' },
  { formText: 'habla', formLabel: 'indicativo presente usted' },
  { formText: 'hablamos', formLabel: 'indicativo presente nosotros' },
  { formText: 'habláis', formLabel: 'indicativo presente vosotros' },
  { formText: 'hablan', formLabel: 'indicativo presente ellos' },
  { formText: 'hablás', formLabel: 'indicativo presente vos' },
  // preterite (simple)
  { formText: 'hablé', formLabel: 'indicativo pretérito-perfecto-simple yo' },
  { formText: 'habló', formLabel: 'indicativo pretérito-perfecto-simple él' },
  { formText: 'hablaron', formLabel: 'indicativo pretérito-perfecto-simple ellos' },
  // imperfect
  { formText: 'hablaba', formLabel: 'indicativo pretérito-imperfecto yo' },
  { formText: 'hablaban', formLabel: 'indicativo pretérito-imperfecto ellos' },
  // future
  { formText: 'hablaré', formLabel: 'indicativo futuro yo' },
  { formText: 'hablará', formLabel: 'indicativo futuro él' },
  // conditional
  { formText: 'hablaría', formLabel: 'condicional presente yo' },
  { formText: 'hablarían', formLabel: 'condicional presente ellos' },
  // subjunctive present
  { formText: 'hable', formLabel: 'subjuntivo presente yo' },
  { formText: 'hablen', formLabel: 'subjuntivo presente ellos' },
  // subjunctive imperfect (-ra primary, -se variant)
  { formText: 'hablara', formLabel: 'subjuntivo pretérito-imperfecto-1 yo' },
  { formText: 'hablase', formLabel: 'subjuntivo pretérito-imperfecto-2 yo' },
  // imperative
  { formText: 'habla', formLabel: 'imperativo afirmativo' },
  { formText: 'hable', formLabel: 'imperativo afirmativo' },
  { formText: 'no hables', formLabel: 'imperativo negativo' },
  // --- noise that must be ignored ---
  { formText: 'he hablado', formLabel: 'indicativo pretérito-perfecto-compuesto yo' }, // compound
  { formText: 'había hablado', formLabel: 'indicativo pretérito-pluscuamperfecto yo' }, // compound
  { formText: 'habría hablado', formLabel: 'condicional perfecto yo' }, // compound
  { formText: 'habla', formLabel: 'indicative present singular third-person' }, // english dup
  { formText: 'fabular', formLabel: 'alternative obsolete' }, // obsolete
  { formText: 'hablándolo', formLabel: 'accusative combined-form gerund object-singular object-third-person' }, // clitic
]

describe('buildConjugation', () => {
  const c = buildConjugation(HABLAR)!

  it('extracts the non-finite forms', () => {
    expect(c.infinitive).toBe('hablar')
    expect(c.gerund).toBe('hablando')
    expect(c.pastParticiple).toBe('hablado') // masculine singular, not hablada/hablados
  })

  it('builds the indicative present with the six canonical persons', () => {
    const pres = c.indicative.find((t) => t.key === 'present')!
    expect(pres.forms).toEqual({
      '1s': 'hablo', '2s': 'hablas', '3s': 'habla',
      '1p': 'hablamos', '2p': 'habláis', '3p': 'hablan',
    })
  })

  it('prefers él over ella/usted and tú over vos for a cell', () => {
    const pres = c.indicative.find((t) => t.key === 'present')!
    expect(pres.forms['3s']).toBe('habla') // él, not the ella/usted duplicate
    expect(pres.forms['2s']).toBe('hablas') // tú, not vos (hablás)
  })

  it('orders indicative tenses present, preterite, imperfect, conditional, future', () => {
    expect(c.indicative.map((t) => t.key)).toEqual([
      'present', 'preterite', 'imperfect', 'conditional', 'future',
    ])
    expect(c.indicative.find((t) => t.key === 'preterite')!.forms['1s']).toBe('hablé')
    expect(c.indicative.find((t) => t.key === 'imperfect')!.forms['1s']).toBe('hablaba')
    expect(c.indicative.find((t) => t.key === 'future')!.forms['1s']).toBe('hablaré')
    expect(c.indicative.find((t) => t.key === 'conditional')!.forms['1s']).toBe('hablaría')
  })

  it('builds present and imperfect subjunctive (preferring the -ra variant)', () => {
    expect(c.subjunctive.map((t) => t.key)).toEqual(['subPresent', 'subImperfect'])
    expect(c.subjunctive.find((t) => t.key === 'subPresent')!.forms['1s']).toBe('hable')
    expect(c.subjunctive.find((t) => t.key === 'subImperfect')!.forms['1s']).toBe('hablara')
  })

  it('collects deduped imperative forms', () => {
    expect(c.imperativeAffirmative).toEqual(['habla', 'hable'])
    expect(c.imperativeNegative).toEqual(['no hables'])
  })

  it('excludes compound tenses, english duplicates, obsolete and clitic forms', () => {
    const everyForm = [
      ...c.indicative.flatMap((t) => Object.values(t.forms)),
      ...c.subjunctive.flatMap((t) => Object.values(t.forms)),
    ]
    expect(everyForm).not.toContain('he hablado')
    expect(everyForm).not.toContain('había hablado')
    expect(everyForm).not.toContain('habría hablado')
    expect(everyForm).not.toContain('fabular')
    expect(everyForm).not.toContain('hablándolo')
  })

  it('returns null when there are no verb forms', () => {
    expect(buildConjugation([{ formText: 'casas', formLabel: 'plural' }])).toBeNull()
    expect(buildConjugation([])).toBeNull()
  })
})
