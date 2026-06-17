import { z } from 'zod'
import type { ContentSource } from './ContentSource'
import type { Language, Lesson, VocabItem, LangCode } from './types'
import { parseLanguageRow, parseVocabRow, parseLessonRow } from './rows'
import { createClient } from '@/lib/supabase/server'

const lessonVocabRow = z.object({
  lesson_id: z.string().min(1),
  vocab_id: z.string().min(1),
  position: z.number().int(),
})

async function lessonVocabIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessonIds: string[],
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from('lesson_vocab')
    .select('lesson_id, vocab_id, position')
    .in('lesson_id', lessonIds)
    .order('position')
  if (error) throw error
  const map = new Map<string, string[]>()
  for (const row of data ?? []) {
    const r = lessonVocabRow.parse(row)
    const arr = map.get(r.lesson_id) ?? []
    arr.push(r.vocab_id)
    map.set(r.lesson_id, arr)
  }
  return map
}

export class SupabaseContentSource implements ContentSource {
  async getLanguages(): Promise<Language[]> {
    const supabase = await createClient()
    const { data, error } = await supabase.from('languages').select('*')
    if (error) throw error
    return (data ?? []).map(parseLanguageRow)
  }

  async getLessons(lang: LangCode): Promise<Lesson[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('lang', lang)
      .order('position')
    if (error) throw error
    const base = (data ?? []).map(parseLessonRow)
    const ids = await lessonVocabIds(supabase, base.map((l) => l.id))
    return base.map((l) => ({ ...l, vocabIds: ids.get(l.id) ?? [] }))
  }

  async getLesson(lessonId: string): Promise<Lesson | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const base = parseLessonRow(data)
    const ids = await lessonVocabIds(supabase, [base.id])
    return { ...base, vocabIds: ids.get(base.id) ?? [] }
  }

  async getVocab(ids: string[]): Promise<VocabItem[]> {
    if (ids.length === 0) return []
    const supabase = await createClient()
    const { data, error } = await supabase.from('vocab_items').select('*').in('id', ids)
    if (error) throw error
    const parsed = (data ?? []).map(parseVocabRow)
    const byId = new Map(parsed.map((v) => [v.id, v]))
    return ids.map((id) => byId.get(id)).filter((v): v is VocabItem => Boolean(v))
  }

  async getVocabByLang(lang: LangCode): Promise<VocabItem[]> {
    const supabase = await createClient()
    const { data, error } = await supabase.from('vocab_items').select('*').eq('lang', lang)
    if (error) throw error
    return (data ?? []).map(parseVocabRow)
  }
}
