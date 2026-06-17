import { describe, it, expect } from 'vitest'
import { LocalContentSource } from '@/lib/content/LocalContentSource'

const src = new LocalContentSource()

describe('LocalContentSource', () => {
  it('lists three languages', async () => {
    const langs = await src.getLanguages()
    expect(langs.map((l) => l.code).sort()).toEqual(['en', 'es', 'zh'])
  })
  it('returns lessons sorted by position for a language', async () => {
    const lessons = await src.getLessons('zh')
    expect(lessons.length).toBeGreaterThan(0)
    expect(lessons[0].lang).toBe('zh')
    const positions = lessons.map((l) => l.position)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
  it('gets a lesson by id, null when missing', async () => {
    expect((await src.getLesson('zh-l1'))?.id).toBe('zh-l1')
    expect(await src.getLesson('nope')).toBeNull()
  })
  it('gets vocab by ids preserving requested order', async () => {
    const v = await src.getVocab(['zh-2', 'zh-1'])
    expect(v.map((x) => x.id)).toEqual(['zh-2', 'zh-1'])
  })
  it('gets all vocab for a language', async () => {
    const v = await src.getVocabByLang('es')
    expect(v.every((x) => x.lang === 'es')).toBe(true)
  })
})
