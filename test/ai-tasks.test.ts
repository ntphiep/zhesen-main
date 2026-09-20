import { describe, it, expect } from 'vitest'
import { coachOutput, enrichInput, ERASED_TASKS, isTaskName } from '@/lib/ai/tasks'

describe('coachOutput', () => {
  // Nothing stops a model repeating itself, and the lists are keyed by their own
  // text when rendered -- a repeat is a duplicate React key and a duplicate on
  // screen. Deduped in the schema so both problems go away at once.
  it('keeps a repeated collocation once, in the order it first appeared', () => {
    const out = coachOutput.parse({
      mnemonic: '', collocations: ['a', 'b', 'a'], examples: [], confusables: [],
    })
    expect(out.collocations).toEqual(['a', 'b'])
  })

  it('dedupes examples by their sentence and confusables by their word', () => {
    const out = coachOutput.parse({
      mnemonic: '',
      collocations: [],
      examples: [{ text: 'x', vi: 'một' }, { text: 'x', vi: 'hai' }],
      confusables: [{ word: 'w', note: 'một' }, { word: 'w', note: 'hai' }],
    })
    expect(out.examples).toEqual([{ text: 'x', vi: 'một' }])
    expect(out.confusables).toEqual([{ word: 'w', note: 'một' }])
  })

  it('refuses an answer that is not the promised shape', () => {
    expect(coachOutput.safeParse({ mnemonic: 5 }).success).toBe(false)
  })
})

describe('task inputs', () => {
  it('accepts the three languages and nothing else', () => {
    expect(enrichInput.safeParse({ lang: 'zh', headword: '狗' }).success).toBe(true)
    expect(enrichInput.safeParse({ lang: 'fr', headword: 'chien' }).success).toBe(false)
  })

  it('refuses a blank or oversized headword', () => {
    expect(enrichInput.safeParse({ lang: 'en', headword: '   ' }).success).toBe(false)
    expect(enrichInput.safeParse({ lang: 'en', headword: 'x'.repeat(121) }).success).toBe(false)
  })

  it('names exactly the tasks the route can run', () => {
    expect(Object.keys(ERASED_TASKS).every(isTaskName)).toBe(true)
    expect(isTaskName('drop-tables')).toBe(false)
  })

  it('builds a prompt only for input the task accepts', () => {
    expect(ERASED_TASKS.enrich.promptFor({ lang: 'en', headword: 'dog' })).toContain('dog')
    expect(ERASED_TASKS.enrich.promptFor({ lang: 'fr', headword: 'chien' })).toBeNull()
  })
})

describe('translate', () => {
  // Layer two of phrase lookup. Layer one answers with no model at all, so this one
  // only has to refuse what it cannot read.
  it('accepts a passage and names its language in the prompt', () => {
    const prompt = ERASED_TASKS.translate.promptFor({ lang: 'en', text: 'The dog barks.' })
    expect(prompt).toContain('The dog barks.')
    expect(prompt).toContain('Tiếng Anh')
  })

  it('refuses a passage over the cap the route enforces', () => {
    expect(ERASED_TASKS.translate.promptFor({ lang: 'en', text: 'x'.repeat(1001) })).toBeNull()
    expect(ERASED_TASKS.translate.promptFor({ lang: 'en', text: '   ' })).toBeNull()
  })

  it('refuses an answer with no translation in it', () => {
    expect(ERASED_TASKS.translate.parseOutput({ translationVi: 'Con chó sủa.' }))
      .toEqual({ translationVi: 'Con chó sủa.' })
    expect(ERASED_TASKS.translate.parseOutput({ translationVi: '' })).toBeNull()
  })
})
