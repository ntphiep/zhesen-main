'use client'
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { fetchEntryDetail } from '@/lib/dictionary/entryResponse'
import { entryPath, searchPath } from '@/lib/dictionary/entryId'
import { AiCoach } from '@/components/ai/AiCoach'
import { Pronunciation } from '@/components/lookup/Pronunciation'
import { classifyRelations, RELATION_SECTIONS, type ClassifiedRelations } from '@/lib/dictionary/relations'
import { isSentenceTranslation } from '@/lib/dictionary/textQuality'
import { entryGlosses, mainSenses, planExamples, senseSections } from '@/lib/dictionary/wordPage'
import { EnglishMark, PivotMark } from '@/components/lookup/WordParts'
import type { DictEntryDetail } from '@/lib/dictionary/types'
import type { UserWord } from '@/lib/wordlist/types'
import { PosTag } from '@/components/ui/PosTag'
import st from './Wordlist.module.css'

type DetailState =
  | { status: 'loading' }
  | { status: 'ok'; detail: DictEntryDetail | null }
  | { status: 'error' }

// The wordlist mounts this only while a row is expanded, so without the cache every
// collapse and expand is another Supabase round trip. Entries do not change in a tab.
// ponytail: never evicted; add a cap if a session can realistically expand thousands.
const detailCache = new Map<string, DictEntryDetail | null>()

/** Empty the cache. Module-level state outlives a render and leaks between test
 *  cases, the same reason `resetAiBudgets` exists. */
export function resetDetailCache(): void {
  detailCache.clear()
}

/** A glance, not the word page: three senses, two short examples and two relation lists.
 *  The page behind "Chi tiết" has the rest. */
const SHOWN_SENSES = 3
const SHOWN_EXAMPLES = 2
/** take's first example was 131 characters of 17th-century verse. */
const MAX_EXAMPLE_LENGTH = 100
const GIST_RELATIONS: (keyof ClassifiedRelations)[] = ['collocations', 'synonyms']
const GIST_RELATION_CAP = 6
/** A longer synonym list mixes every sense: take's 249 opened with exterminate and shag. */
const FOCUSED_SYNONYMS = 12

/** The expanded row: the gist of the entry, then the way to the word's own page beside the
 *  assistant. A word typed in by hand has no entry, so it opens the lookup for its headword. */
export function WordDetail({ word }: { word: UserWord }) {
  const actions = (
    <AiCoach lang={word.lang} headword={word.headword} meaningVi={word.meaningVi}>
      <Link
        href={word.entryId ? entryPath(word.entryId) : searchPath(word.lang, word.headword)}
        className={`${st.ghost} ${st.sm}`}
      >
        {word.entryId ? 'Chi tiết' : 'Tra từ này'}
      </Link>
    </AiCoach>
  )
  return <DetailBody word={word} actions={actions} />
}

/** Every state draws `actions` at the same place in the tree, so an answer the assistant
 *  gave while the entry was loading survives the load. Two columns only where the row is
 *  wide: the grid view's card is a third of the screen. */
function Frame({ left, right, actions }: { left: ReactNode; right?: ReactNode; actions: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid gap-x-8 gap-y-3 text-sm @2xl:grid-cols-2">
        <div className="flex flex-col gap-2">
          {left}
          <div className="mt-1">{actions}</div>
        </div>
        {right && <div className="flex flex-col gap-2">{right}</div>}
      </div>
    </div>
  )
}

function DetailBody({ word, actions }: { word: UserWord; actions: ReactNode }) {
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
      <Frame
        actions={actions}
        left={
          <div className="flex flex-col gap-3">
            {word.meaningVi && <p>{word.meaningVi}</p>}
            {word.example && <p className={`italic ${st.pron}`}>{word.example}</p>}
            {word.notes && <p className={st.pron}>{word.notes}</p>}
          </div>
        }
      />
    )
  }

  if (state.status === 'loading') {
    return <Frame actions={actions} left={<p className={st.pron}>Đang tải…</p>} />
  }

  if (state.status === 'error') {
    return <Frame actions={actions} left={<p className={st.fail}>Chưa tải được chi tiết. Thử lại.</p>} />
  }

  const { detail } = state
  if (!detail) return <Frame actions={actions} left={null} />

  const sections = senseSections(detail.senses)
  const main = mainSenses(sections, SHOWN_SENSES).flatMap((g) => g.senses)
  const glosses = entryGlosses(detail)
  // The example of each sense shown first, then the rest with a real translation first.
  const plan = planExamples(sections, detail.examples, glosses)
  const examples = [...main.flatMap((s) => (s.id && plan.bySense[s.id] ? [plan.bySense[s.id]] : [])), ...plan.others]
    .filter((e) => e.text.length <= MAX_EXAMPLE_LENGTH)
    .slice(0, SHOWN_EXAMPLES)
  const relations = classifyRelations(detail.relations)
  const relationGroups = RELATION_SECTIONS.filter((s) => GIST_RELATIONS.includes(s.key) && relations[s.key].length > 0
    && (s.key !== 'synonyms' || relations[s.key].length <= FOCUSED_SYNONYMS))

  return (
    <Frame
      actions={actions}
      left={<>
        {main.length > 0 && (
          <ul className="flex flex-col gap-1">
            {main.map((s, i) => (
              <li key={s.id ?? i} className="flex gap-2 items-baseline">
                <PosTag value={s.pos} className={`text-xs font-semibold ${st.pron}`} />
                {/* English only where no Vietnamese exists. */}
                {s.glossVi ? (
                  <span className="font-semibold">{s.glossVi}</span>
                ) : s.pivotVi ? (
                  <span className="font-semibold">{s.pivotVi}<PivotMark /></span>
                ) : s.glossEn ? (
                  <span className={st.pron}>{s.glossEn}<EnglishMark /></span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {detail.pronunciations.length > 0 && (
          <Pronunciation headword={detail.headword} prons={detail.pronunciations} lang={detail.lang} />
        )}
      </>}
      right={<>
        {/* Filtered exactly like the lookup page: the same corrupted sentences and the
            same gloss-copied-into-the-translation rows are in this data. */}
        {examples.length > 0 && (
          <ul className="flex flex-col gap-1 border-l-2 border-(--edge) pl-3">
            {examples.map((e, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                <p className="italic">{e.text}</p>
                {isSentenceTranslation(e.translationVi, glosses) && (
                  <p className={st.pron}>{e.translationVi}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {relationGroups.map((s) => (
          <div key={s.key} className="flex gap-2 items-baseline flex-wrap">
            <span className={`${st.label} uppercase`}>{s.label}</span>
            {relations[s.key].slice(0, GIST_RELATION_CAP).map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
        ))}
      </>}
    />
  )
}
