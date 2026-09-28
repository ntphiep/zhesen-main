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

  // Chat streams its reply to the screen as it arrives, which a JSON envelope would
  // show as raw braces; the other tasks stay JSON because a partial object is useless.
  it('asks for plain text in chat and JSON everywhere else', () => {
    const chat = ERASED_TASKS.chat.promptFor({ messages: [{ role: 'user', text: 'chào' }] })
    expect(`${ERASED_TASKS.chat.system}\n${chat}`).not.toContain('JSON')
    expect(ERASED_TASKS.chat.fromText?.(' Chào. ')).toEqual({ reply: 'Chào.' })
    expect(ERASED_TASKS.enrich.system).toContain('JSON')
    expect(ERASED_TASKS.enrich.fromText).toBeUndefined()
  })

  it('builds a prompt only for input the task accepts', () => {
    expect(ERASED_TASKS.enrich.promptFor({ lang: 'en', headword: 'dog' })).toContain('dog')
    expect(ERASED_TASKS.enrich.promptFor({ lang: 'fr', headword: 'chien' })).toBeNull()
  })
})
