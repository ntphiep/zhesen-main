import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Pronunciation } from './Pronunciation'
import { AddToWordlistButton } from './AddToWordlistButton'
import { SenseList } from './SenseList'
import { CharacterPanel } from './CharacterPanel'
import { ConjugationTable } from './ConjugationTable'
import { ExampleList } from './ExampleList'
import { GrammarLinks } from './GrammarLinks'
import { LemmaLink } from './LemmaLink'
import {
  AiCorner, FamilyBlock, FormText, LevelChip, OpenWordContext, PhrasesBlock, SynonymsBlock, WordLink, hasSynonyms,
} from './WordParts'
import { entryPath, splitEntryId } from '@/lib/dictionary/entryId'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { fetchWordView } from '@/lib/dictionary/wordViewResponse'
import type { WordView } from '@/lib/dictionary/wordView'

interface Opened { id: string; text: string }

type PaneState =
  | { status: 'loading' }
  | { status: 'ready'; view: WordView }
  | { status: 'missing' }
  | { status: 'error' }

// Words already fetched stay for the life of the tab, so walking back and forth along a
// chain asks the server once per word.
const loaded = new Map<string, WordView | null>()

const HASH = '#open='
// Every column fetches its word, so a pasted address cannot open more than this.
const MAX_OPEN = 8

/** The chain in the address, each word once and never the page's own word. */
function readHash(rootId: string): Opened[] {
  if (typeof window === 'undefined' || !window.location.hash.startsWith(HASH)) return []
  const ids = window.location.hash.slice(HASH.length).split(',').filter(Boolean).map((raw) => {
    try { return decodeURIComponent(raw) } catch { return raw }
  })
  return [...new Set(ids)].filter((id) => id !== rootId).slice(0, MAX_OPEN).map((id) => ({ id, text: splitEntryId(id).key }))
}

function writeHash(trail: Opened[]) {
  const url = trail.length > 0
    ? `${HASH}${trail.map((o) => encodeURIComponent(o.id)).join(',')}`
    : `${window.location.pathname}${window.location.search}`
  window.history.replaceState(window.history.state, '', url)
}

/**
 * Related words open beside the page: a click on a related word opens it as a new column
 * instead of leaving, the older columns fold into narrow spines, and the address keeps the
 * chain so a reload or a shared link reopens it.
 */
export function ColumnsLayout({ view }: { view: WordView }) {
  const [trail, setTrail] = useState<Opened[]>(() => readHash(view.head.id))
  const rowRef = useRef<HTMLDivElement>(null)

  function update(next: Opened[]) {
    setTrail(next)
    writeHash(next)
  }

  // Scrolls the newest column into view; on a phone the columns are a sideways row.
  useEffect(() => {
    if (trail.length === 0) return
    rowRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }, [trail.length])

  // A pane opens its word to the right of itself and closes whatever was further right. A
  // word already open is walked back to instead, so no word is ever open twice.
  const openFrom = (depth: number) => (id: string, text: string) => {
    if (id === view.head.id) return update([])
    const at = trail.findIndex((o) => o.id === id)
    update(at >= 0 ? trail.slice(0, at + 1) : [...trail.slice(0, depth), { id, text }])
  }
  // On a wide screen the last two columns show in full and the earlier ones as spines.
  const firstFull = Math.max(0, trail.length - 1)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-black/45">Đang xem</span>
        <button type="button" onClick={() => update([])} className="font-semibold hover:underline">{view.head.headword}</button>
        {trail.map((o, i) => (
          <span key={o.id} className="flex items-center gap-2">
            <span aria-hidden="true" className="text-black/30">›</span>
            <button type="button" onClick={() => update(trail.slice(0, i + 1))} className="font-semibold hover:underline">
              {o.text}
            </button>
          </span>
        ))}
        {trail.length > 0 && (
          <button type="button" onClick={() => update([])} className="ml-auto text-blue-700 hover:underline">Đóng tất cả</button>
        )}
      </div>

      <div ref={rowRef} className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:snap-none lg:overflow-visible lg:px-0">
        {[{ id: view.head.id, text: view.head.headword }, ...trail].map((o, depth) => {
          const spine = depth < firstFull
          return (
            <div
              key={o.id}
              // On a wide screen every column scrolls on its own and stays in view, so a word
              // opened from far down the page does not appear out of sight at the top.
              className={`w-[88vw] shrink-0 snap-start sm:w-[28rem] lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:max-h-[calc(100dvh-var(--header-h)-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain ${spine ? 'lg:w-12' : 'lg:min-w-0 lg:max-w-[52rem] lg:flex-1 lg:shrink'}`}
            >
              {spine && (
                <button
                  type="button"
                  onClick={() => update(trail.slice(0, depth))}
                  title={`Quay lại ${o.text}`}
                  className="hidden h-full min-h-64 w-12 items-start justify-center rounded-xl border border-black/10 py-4 hover:bg-black/5 lg:flex"
                >
                  <span className="font-semibold [writing-mode:vertical-rl]">{o.text}</span>
                </button>
              )}
              <div className={spine ? 'lg:hidden' : ''}>
                <OpenWordContext.Provider value={openFrom(depth)}>
                  {depth === 0
                    ? <WordPane view={view} root />
                    : <OpenedPane id={o.id} text={o.text} onClose={() => update(trail.slice(0, depth - 1))} />}
                </OpenWordContext.Provider>
              </div>
            </div>
          )
        })}
        {trail.length === 0 && (
          <aside className="hidden w-72 shrink-0 flex-col gap-2 self-start rounded-xl border border-dashed border-black/20 p-5 text-sm text-black/60 lg:flex">
            <p className="font-semibold text-black/80">Mở từ liên quan thành cột</p>
            <p>Bấm một từ liên quan để mở nó bên cạnh trang này.</p>
            <p>Giữ Ctrl hoặc Cmd rồi bấm để mở trang riêng.</p>
          </aside>
        )}
      </div>
    </div>
  )
}

function OpenedPane({ id, text, onClose }: { id: string; text: string; onClose: () => void }) {
  const [state, setState] = useState<PaneState>(() => {
    const hit = loaded.get(id)
    return hit === undefined ? { status: 'loading' } : hit ? { status: 'ready', view: hit } : { status: 'missing' }
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (loaded.has(id)) return
    const ctrl = new AbortController()
    fetchWordView(id, ctrl.signal).then(
      (v) => {
        loaded.set(id, v)
        setState(v ? { status: 'ready', view: v } : { status: 'missing' })
      },
      () => { if (!ctrl.signal.aborted) setState({ status: 'error' }) },
    )
    return () => ctrl.abort()
  }, [id, attempt])

  if (state.status === 'ready') return <WordPane view={state.view} onClose={onClose} />
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-black/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-3xl font-bold tracking-tight">{text}</h2>
        <CloseButton onClose={onClose} />
      </div>
      {state.status === 'loading' && <p className="text-sm text-black/45" role="status">Đang mở…</p>}
      {state.status === 'missing' && <p className="text-sm text-black/60">Không tìm thấy từ này.</p>}
      {state.status === 'error' && (
        <p className="flex flex-wrap items-center gap-3 text-sm text-black/60">
          Chưa mở được từ này.
          <button
            type="button"
            onClick={() => { setState({ status: 'loading' }); setAttempt((n) => n + 1) }}
            className="font-medium text-blue-700 hover:underline"
          >
            Thử lại
          </button>
        </p>
      )}
    </section>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Đóng cột"
      className="grid size-8 shrink-0 place-items-center rounded-full text-black/50 hover:bg-black/5 hover:text-black"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  )
}

function PaneSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-black/10 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-black/55">{title}</h3>
      {children}
    </section>
  )
}

/** One word in a column: the same material as the page, stacked. */
function WordPane({ view, root = false, onClose }: { view: WordView; root?: boolean; onClose?: () => void }) {
  const { head } = view
  const Heading = root ? 'h1' : 'h2'
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-black/10 p-5">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Heading className="text-4xl font-bold tracking-tight">{head.headword}</Heading>
            {head.traditional && head.traditional !== head.headword && <span className="text-2xl text-black/40">{head.traditional}</span>}
            <LevelChip level={head.level} strong />
          </div>
          {onClose && <CloseButton onClose={onClose} />}
        </div>
        <Pronunciation headword={head.headword} prons={head.pronunciations} lang={head.lang} />
        {view.summary && <p className="text-lg leading-snug text-black/85">{view.summary}</p>}
        {view.lemma && <LemmaLink lemma={view.lemma} preview={view.lemmaPreview ?? undefined} lang={head.lang} />}
        <div className="flex flex-wrap items-center gap-3">
          <AddToWordlistButton entry={{ ...head, pronunciations: [] }} />
          {!root && <Link href={entryPath(head.id)} className="text-sm font-medium text-blue-700 hover:underline">Mở trang</Link>}
        </div>
      </header>

      {view.forms.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          {view.forms.map((f) => <span key={f.text} title={f.label} className="font-medium"><FormText form={f} /></span>)}
        </p>
      )}
      <SenseList senses={view.senses} lang={head.lang} examples={view.examplesBySense} resolved={view.resolved} glosses={view.glosses} />
      {head.lang === 'zh' && <CharacterPanel characters={view.characters} />}
      {view.conjugation && <ConjugationTable conjugation={view.conjugation} />}
      {hasSynonyms(view) && <PaneSection title="Đồng nghĩa"><SynonymsBlock view={view} /></PaneSection>}
      {view.phrases.length > 0 && (
        <PaneSection title="Cụm từ"><PhrasesBlock headword={head.headword} lang={head.lang} phrases={view.phrases} shown={4} /></PaneSection>
      )}
      {view.family.length + view.related.length > 0 && (
        <PaneSection title="Họ từ"><FamilyBlock family={view.family} related={view.related} /></PaneSection>
      )}
      <ExampleList
        examples={view.examples}
        lang={head.lang}
        resolved={view.resolved}
        glosses={view.glosses}
        title={Object.keys(view.examplesBySense).length > 0 ? 'Ví dụ khác' : 'Ví dụ'}
      />
      {view.siblings.length > 0 && (
        <PaneSection title="Ngôn ngữ khác">
          <ul className="flex flex-col gap-1">
            {view.siblings.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="w-8 shrink-0 text-xs text-black/40" title={LANG_LABELS[s.lang]}>{s.lang.toUpperCase()}</span>
                <WordLink
                  word={{ text: s.headword, href: entryPath(s.id), id: s.id }}
                  className="font-semibold text-blue-700 hover:underline"
                />
                {s.reading && <span className="text-black/45">{s.reading}</span>}
                <span className="text-black/65">{s.glossVi || s.glossEn}</span>
              </li>
            ))}
          </ul>
        </PaneSection>
      )}
      {root && <GrammarLinks points={view.grammarPoints} rail />}
      {root && <AiCorner lang={head.lang} headword={head.headword} meaningVi={view.meaningVi} />}
    </article>
  )
}
