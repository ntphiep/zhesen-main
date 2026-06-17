import type { ProgressStore } from './ProgressStore'
import type { CardRecord, Grade, LessonProgress, LessonStatus } from './types'
import type { LangCode } from '@/lib/content/types'
import { initialSrsState, review } from './srs'
import { cardFromRow, cardToRow, lessonProgressFromRow } from './rows'

// Accepts the @supabase/ssr browser client (typed loosely so tests can inject a fake).
type Client = { from: (t: string) => any; auth?: any }

export class SupabaseProgressStore implements ProgressStore {
  constructor(private supabase: Client, private userIdOverride?: string) {}

  private async userId(): Promise<string> {
    if (this.userIdOverride) return this.userIdOverride
    const { data } = await this.supabase.auth!.getUser()
    const id = data?.user?.id
    if (!id) throw new Error('No authenticated user')
    return id
  }

  async ensureCards(items: { vocabId: string; lang: LangCode }[], now: number): Promise<void> {
    if (items.length === 0) return
    const userId = await this.userId()
    const rows = items.map((i) => cardToRow(userId, { ...initialSrsState(i.vocabId, now), lang: i.lang }))
    const { error } = await this.supabase.from('srs_state').upsert(rows, { onConflict: 'user_id,vocab_id', ignoreDuplicates: true })
    if (error) throw error
  }

  async getDueCards(lang: LangCode, now: number, limit?: number): Promise<CardRecord[]> {
    const userId = await this.userId()
    let q = this.supabase
      .from('srs_state')
      .select('*')
      .eq('user_id', userId)
      .eq('lang', lang)
      .lte('due_at', new Date(now).toISOString())
      .order('due_at')
    if (typeof limit === 'number') q = q.limit(limit)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(cardFromRow)
  }

  async countDue(lang: LangCode, now: number): Promise<number> {
    return (await this.getDueCards(lang, now)).length
  }

  async recordReview(vocabId: string, grade: Grade, now: number): Promise<CardRecord> {
    const userId = await this.userId()
    const { data, error } = await this.supabase
      .from('srs_state')
      .select('*')
      .eq('user_id', userId)
      .eq('vocab_id', vocabId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`No card for vocab ${vocabId}`)
    const current = cardFromRow(data)
    const updated: CardRecord = { ...review(current, grade, now), lang: current.lang }
    const { error: upErr } = await this.supabase
      .from('srs_state')
      .upsert(cardToRow(userId, updated), { onConflict: 'user_id,vocab_id' })
    if (upErr) throw upErr
    return updated
  }

  async getLessonProgress(lessonId: string): Promise<LessonProgress | null> {
    const userId = await this.userId()
    const { data, error } = await this.supabase
      .from('lesson_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .maybeSingle()
    if (error) throw error
    return data ? lessonProgressFromRow(data) : null
  }

  async setLessonProgress(lessonId: string, status: LessonStatus, now: number): Promise<void> {
    const userId = await this.userId()
    const { error } = await this.supabase.from('lesson_progress').upsert(
      {
        user_id: userId,
        lesson_id: lessonId,
        status,
        completed_at: status === 'completed' ? new Date(now).toISOString() : null,
      },
      { onConflict: 'user_id,lesson_id' },
    )
    if (error) throw error
  }
}
