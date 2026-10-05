import { describe, it, expect } from 'vitest'
import { ERASED_TASKS } from '@/lib/ai/tasks'

const whole = (task: keyof typeof ERASED_TASKS, input: unknown) =>
  `${ERASED_TASKS[task].system}\n${ERASED_TASKS[task].promptFor(input)}`

describe('the exam framing', () => {
  // A Chinese or Spanish word was coached with office-and-commerce examples for TOEIC.
  it('appears for English only, in every task that takes a language', () => {
    for (const lang of ['zh', 'es']) {
      expect(whole('enrich', { lang, headword: 'x' })).not.toContain('TOEIC')
      expect(whole('coach', { lang, headword: 'x', meaningVi: null })).not.toContain('TOEIC')
    }
    expect(whole('enrich', { lang: 'en', headword: 'invoice' })).toContain('TOEIC')
    expect(whole('coach', { lang: 'en', headword: 'invoice', meaningVi: null })).toContain('TOEIC')
  })

  it('appears in no task without a language', () => {
    expect(whole('suggest', { query: 'hoãn' })).not.toContain('TOEIC')
    expect(whole('tags', { words: [{ headword: 'invoice', meaningVi: null }] })).not.toContain('TOEIC')
    expect(whole('chat', { messages: [{ role: 'user', text: 'chào' }] })).not.toContain('TOEIC')
  })
})

describe('suggest', () => {
  it('asks only for the languages the box is set to', () => {
    const prompt = whole('suggest', { query: 'cơm', direction: 'vi', targets: ['zh'] })
    expect(prompt).toContain('tiếng trung')
    expect(prompt).not.toContain('tiếng anh')
    expect(prompt).toContain('tiếng Việt')
  })

  it('keeps only candidates in those languages', () => {
    const parse = ERASED_TASKS.suggest.parserFor({ query: 'cơm', direction: 'vi', targets: ['zh'] })
    expect(parse({ words: [
      { lang: 'en', headword: 'rice', meaningVi: 'cơm' },
      { lang: 'zh', headword: '饭', meaningVi: 'cơm' },
    ] })).toEqual({ words: [{ lang: 'zh', headword: '饭', meaningVi: 'cơm' }] })
  })

  it('still takes a query alone', () => {
    expect(ERASED_TASKS.suggest.promptFor({ query: 'hoãn' })).not.toBeNull()
    expect(ERASED_TASKS.suggest.promptFor({ query: 'hoãn', targets: ['fr'] })).toBeNull()
  })
})
