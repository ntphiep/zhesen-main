import { z } from 'zod'
import { unstable_cache } from 'next/cache'
import type { ContentSource } from './ContentSource'
import type { Language, Lesson, VocabItem, LangCode } from './types'
import { parseLanguageRow, parseVocabRow, parseLessonRow } from './rows'
import { createContentClient } from '@/lib/supabase/content'

const lessonVocabItem = z.object({
  vocab_id: z.string().min(1),
  position: z.number().int(),
})

// Module-level cached read functions — safe because createContentClient() never
// calls cookies(), so unstable_cache wrapping is valid here.

const cachedGetLanguages = unstable_cache(
  async (): Promise<Language[]> => {
    const supabase = createContentClient()
    const { data, error } = await supabase.from('languages').select('*')
    if (error) throw error
    return (data ?? []).map(parseLanguageRow)
  },
  ['getLanguages'],
  { revalidate: 3600, tags: ['content'] },
)

const cachedGetLessons = unstable_cache(
  async (lang: LangCode): Promise<Lesson[]> => {
    const supabase = createContentClient()
    // Single nested query — collapses the previous two-query waterfall
    const { data, error } = await supabase
      .from('lessons')
      .select('id, lang, title, description, position, lesson_vocab(vocab_id, position)')
      .eq('lang', lang)
      .order('position')
    if (error) throw error
    return (data ?? []).map((row) => {
      const base = parseLessonRow(row)
      const items = z.array(lessonVocabItem).parse(row.lesson_vocab ?? [])
      const vocabIds = items.sort((a, b) => a.position - b.position).map((i) => i.vocab_id)
      return { ...base, vocabIds }
    })
  },
  ['getLessons'],
  { revalidate: 3600, tags: ['content'] },
)

const cachedGetLesson = unstable_cache(
  async (lessonId: string): Promise<Lesson | null> => {
    const supabase = createContentClient()
    const { data, error } = await supabase
      .from('lessons')
      .select('id, lang, title, description, position, lesson_vocab(vocab_id, position)')
      .eq('id', lessonId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const base = parseLessonRow(data)
    const items = z.array(lessonVocabItem).parse(data.lesson_vocab ?? [])
    const vocabIds = items.sort((a, b) => a.position - b.position).map((i) => i.vocab_id)
    return { ...base, vocabIds }
  },
  ['getLesson'],
  { revalidate: 3600, tags: ['content'] },
)

const cachedGetVocab = unstable_cache(
  async (ids: string[]): Promise<VocabItem[]> => {
    if (ids.length === 0) return []
    const supabase = createContentClient()
    const { data, error } = await supabase.from('vocab_items').select('*').in('id', ids)
    if (error) throw error
    const parsed = (data ?? []).map(parseVocabRow)
    const byId = new Map(parsed.map((v) => [v.id, v]))
    return ids.map((id) => byId.get(id)).filter((v): v is VocabItem => Boolean(v))
  },
  ['getVocab'],
  { revalidate: 3600, tags: ['content'] },
)

const cachedGetVocabByLang = unstable_cache(
  async (lang: LangCode): Promise<VocabItem[]> => {
    const supabase = createContentClient()
    // Limit 200: sufficient for quiz answer pool, avoids full-table scan as lex data grows
    const { data, error } = await supabase
      .from('vocab_items')
      .select('*')
      .eq('lang', lang)
      .limit(200)
    if (error) throw error
    return (data ?? []).map(parseVocabRow)
  },
  ['getVocabByLang'],
  { revalidate: 3600, tags: ['content'] },
)

export class SupabaseContentSource implements ContentSource {
  async getLanguages(): Promise<Language[]> {
    return cachedGetLanguages()
  }

  async getLessons(lang: LangCode): Promise<Lesson[]> {
    return cachedGetLessons(lang)
  }

  async getLesson(lessonId: string): Promise<Lesson | null> {
    return cachedGetLesson(lessonId)
  }

  async getVocab(ids: string[]): Promise<VocabItem[]> {
    return cachedGetVocab(ids)
  }

  async getVocabByLang(lang: LangCode): Promise<VocabItem[]> {
    return cachedGetVocabByLang(lang)
  }
}
