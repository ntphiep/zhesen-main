'use client'
import { useEffect, useState } from 'react'
import { fetchEntryDetail } from '@/lib/dictionary/entryResponse'
import { AudioButton } from '@/components/ui/AudioButton'
import { AiCoach } from '@/components/ai/AiCoach'
import { pickExamples, isSentenceTranslation } from '@/lib/dictionary/textQuality'
import type { DictEntryDetail } from '@/lib/dictionary/types'
import type { UserWord } from '@/lib/wordlist/types'
import { Ipa } from '@/components/ui/Ipa'

type DetailState =
  | { status: 'loading' }
  | { status: 'ok'; detail: DictEntryDetail | null }
  | { status: 'error' }

// The wordlist mounts this only while a row is expanded, so without the cache every
// collapse and expand is another Supabase round trip. Entries do not change in a tab.
// ponytail: never evicted; add a cap if a session can realistically expand thousands.
const detailCache = new Map<string, DictEntryDetail | null>()

/** Empty the cache. Module-level state outlives a render and leaks between test
 *  cases, the same reason `resetSessionState` exists. */
export function resetDetailCache(): void {
  detailCache.clear()
}

export function WordDetail({ word }: { word: UserWord }) {
  const [state, setState] = useState<DetailState>(() => {
    const id = word.entryId
    return id && detailCache.has(id)
      ? { status: 'ok', detail: detailCache.get(id) ?? null }
      : { status: 'loading' }
  })

  useEffect(() => {
    const entryId = word.entryId
    if (!entryId || detailCache.has(entryId)) return
    const ctrl = new AbortController()
    async function run(id: string) {
      setState({ status: 'loading' })
      try {
        const outcome = await fetchEntryDetail(id, ctrl.signal)
        // A refusal is not an empty entry: caching it would replay the refusal for the
        // rest of the session.
        if (outcome.status === 'refused') { setState({ status: 'error' }); return }
        detailCache.set(id, outcome.detail)
        setState({ status: 'ok', detail: outcome.detail })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ status: 'error' })
      }
    }
    run(entryId)
    return () => { ctrl.abort() }
  }, [word.entryId])

  if (!word.entryId) {
    return (
      <div className="flex flex-col gap-3 text-sm text-black/80">
        {word.meaningVi && <p>{word.meaningVi}</p>}
        {word.example && <p className="italic text-black/60">{word.example}</p>}
        {word.notes && <p className="text-black/50">{word.notes}</p>}
        <AiCoach lang={word.lang} headword={word.headword} meaningVi={word.meaningVi} />
      </div>
    )
  }

  if (state.status === 'loading') {
    return <p className="text-sm text-black/40">Đang tải…</p>
  }

  if (state.status === 'error') {
    return <p className="text-sm text-red-500">Không tải được chi tiết.</p>
  }

  const { detail } = state
  if (!detail) return null

  const glosses = [detail.glossVi, ...detail.senses.map((sense) => sense.glossVi)]
  const examples = pickExamples(detail.examples)

  const relationGroups = detail.relations.reduce<Record<string, string[]>>((acc, r) => {
    if (!r.relatedText) return acc
    const key = r.relationType
    if (!acc[key]) acc[key] = []
    acc[key].push(r.relatedText)
    return acc
  }, {})

  return (
    <div className="flex flex-col gap-3 text-sm">
      {detail.senses.length > 0 && (
        <div className="flex flex-col gap-1">
          {detail.senses.map((s, i) => (
            <div key={i} className="flex gap-2 items-baseline">
              {s.pos && <span className="text-xs font-medium text-black/40 uppercase">{s.pos}</span>}
              {s.glossVi && <span className="text-black/80">{s.glossVi}</span>}
              {s.glossEn && <span className="text-black/50">{s.glossEn}</span>}
            </div>
          ))}
        </div>
      )}

      {detail.pronunciations.length > 0 && (
        <div className="flex flex-col gap-1">
          {detail.pronunciations.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-black/40">{p.accent}</span>
              <Ipa value={p.ipa} lang={detail.lang} className="text-black/70" />
              <AudioButton text={detail.headword} lang={detail.lang} audioUrl={p.audioUrl} />
            </div>
          ))}
        </div>
      )}

      {/* Filtered exactly like the lookup page: the same corrupted sentences and the
          same gloss-copied-into-the-translation rows are in this data. */}
      {examples.length > 0 && (
        <div className="flex flex-col gap-1 border-l-2 border-black/10 pl-3">
          {examples.map((e, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <p className="italic text-black/70">{e.text}</p>
              {isSentenceTranslation(e.translationVi, glosses) && (
                <p className="text-black/50">{e.translationVi}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {Object.keys(relationGroups).length > 0 && (
        <div className="flex flex-col gap-1">
          {Object.entries(relationGroups).map(([type, words]) => (
            <div key={type} className="flex gap-2 items-baseline flex-wrap">
              <span className="text-xs font-medium text-black/40 uppercase">{type}</span>
              {words.map((w, i) => (
                <span key={i} className="text-black/70">{w}</span>
              ))}
            </div>
          ))}
        </div>
      )}

      <AiCoach lang={detail.lang} headword={detail.headword} meaningVi={word.meaningVi} />
    </div>
  )
}
