'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { formatPos, parsePos } from '@/lib/dictionary/pos'
import { fetchSearch } from '@/lib/dictionary/searchClient'
import { draftFromDictEntry } from '@/lib/wordlist/store'
import { callAi } from '@/lib/ai/browser'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import { KNOWN_HINT, STATUS_OPTIONS, type AiField, type WordDraft, type WordStatus } from '@/lib/wordlist/types'
import { LANGUAGES, type LangCode } from '@/lib/languages'
import { Ipa } from '@/components/ui/Ipa'
import s from './Wordlist.module.css'

type Tab = 'dict' | 'manual'

interface Props {
  open: boolean
  onClose: () => void
  onAdd: (draft: WordDraft) => void | Promise<void>
  /** Entry ids already in the wordlist, so the list can say so instead of letting
   *  the add fail against the unique index (migration 0031). */
  savedEntryIds?: ReadonlySet<string>
}

export function AddWordDialog({ open, onClose, onAdd, savedEntryIds }: Props) {

  const [tab, setTab] = useState<Tab>('dict')

  // Dictionary tab state
  const [lang, setLang] = useState<LangCode>('en')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DictEntryPreview[]>([])
  const [searching, setSearching] = useState(false)
  // The route answered with a status and no result set: saying "not found" would be a
  // claim about a dictionary that was never asked.
  const [refusal, setRefusal] = useState<string | null>(null)

  // Manual tab state
  const [manualLang, setManualLang] = useState<LangCode>('en')
  const [headword, setHeadword] = useState('')
  const [meaningVi, setMeaningVi] = useState('')
  const [meaningEn, setMeaningEn] = useState('')
  const [ipa, setIpa] = useState('')
  const [pos, setPos] = useState('')
  const [example, setExample] = useState('')
  const [exampleVi, setExampleVi] = useState('')
  const [status, setStatus] = useState<WordStatus>('new')

  // Assistant state for the manual tab.
  const aiOn = useAiEnabled()
  const [filling, setFilling] = useState(false)
  const [fillError, setFillError] = useState<string | null>(null)
  /** Fields the assistant filled and the learner has not edited since. */
  const [aiFilled, setAiFilled] = useState<AiField[]>([])
  const [aiLevel, setAiLevel] = useState<string | null>(null)
  const unmark = (f: AiField) => setAiFilled((xs) => xs.filter((x) => x !== f))
  // The entry the headword typed by hand already is: saving it keeps the senses and audio.
  const [match, setMatch] = useState<DictEntryPreview | null>(null)
  const offer = match && match.lang === manualLang && match.headword.toLowerCase() === headword.trim().toLowerCase()
    ? match : null
  // A level and AI labels belong to the headword they were filled for.
  const [aiHeadword, setAiHeadword] = useState('')
  if (headword.trim() !== aiHeadword) {
    setAiHeadword(headword.trim())
    if (aiFilled.length > 0) setAiFilled([])
    if (aiLevel !== null) setAiLevel(null)
  }

  // Adjust state during render, not in an effect: react.dev/learn/you-might-not-need-an-effect.
  const [prevQuery, setPrevQuery] = useState(query)
  const [prevLang, setPrevLang] = useState(lang)
  if (query !== prevQuery || lang !== prevLang) {
    setPrevQuery(query)
    setPrevLang(lang)
    if (!query.trim()) setResults([])
    // Until both directions answer, an empty list means "not yet", not "not found".
    setSearching(query.trim() !== '')
    setRefusal(null)
  }

  // Modal keeps its children mounted while closed, so without clearing on reopen the
  // box still shows the last word looked up.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setQuery(''); setPrevQuery(''); setResults([]); setSearching(false); setFillError(null) }
  }

  useEffect(() => {
    if (!query.trim()) return
    // Abort on query change: a slow request for "cat" could otherwise land after a
    // fast one for "cats" and overwrite the list.
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      // Both directions, because the learner may type either the word or its Vietnamese
      // meaning, and the route answers one per call. In parallel and for the chosen
      // language only: in sequence and for all three, a new word took 0.5 to 1.4 s.
      // Through the cached route: straight to Supabase costs a cross-region round trip
      // per keystroke and skips both the shared cache and the per-address budget.
      let foreign: DictEntryPreview[] | null = null
      let native: DictEntryPreview[] | null = null
      let foreignDone = false
      let refused: string | null = null
      // Keyed by id so the foreign direction, the cheaper and more likely answer, keeps
      // first place. The Vietnamese direction is held until the foreign one settles, so
      // it only ever appends below and never moves a row the learner is about to click.
      function show() {
        if (!foreignDone) return
        const byId = new Map<string, DictEntryPreview>()
        for (const e of [...(foreign ?? []), ...(native ?? [])]) if (!byId.has(e.id)) byId.set(e.id, e)
        setResults([...byId.values()])
      }
      const opts = { langs: [lang] }
      const ask = (dir: 'fw' | 'vi') =>
        fetchSearch(query, ctrl.signal, dir === 'vi' ? { ...opts, dir } : opts).then((o) => {
          if (o.status === 'ok') return o.data.entries[lang]
          refused = o.message
          return null
        })
      await Promise.allSettled([
        ask('fw').then((found) => { foreign = found }).finally(() => {
          foreignDone = true
          if (!ctrl.signal.aborted) show()
        }),
        ask('vi').then((found) => {
          native = found
          if (!ctrl.signal.aborted) show()
        }),
      ])
      if (ctrl.signal.aborted) return
      if (foreign === null && native === null) {
        setResults([])
        setRefusal(refused ?? 'Chưa tìm được. Thử lại.')
      }
      setSearching(false)
    }, 250)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [query, lang])

  useEffect(() => {
    const word = headword.trim()
    if (tab !== 'manual' || !word) return
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      try {
        const o = await fetchSearch(word, ctrl.signal, { langs: [manualLang] })
        if (o.status === 'ok') setMatch(o.data.entries[manualLang].find((e) => e.headword.toLowerCase() === word.toLowerCase()) ?? null)
      } catch {
        // The offer is a shortcut; the form works without it.
      }
    }, 400)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [headword, manualLang, tab])

  async function handleDictAdd(entry: DictEntryPreview) {
    await onAdd(draftFromDictEntry(entry))
    setQuery('')
    setResults([])
  }

  async function handleManualSave() {
    if (!headword.trim()) return
    const draft: WordDraft = {
      lang: manualLang,
      entryId: null,
      headword: headword.trim(),
      reading: null,
      ipa: ipa.trim() || null,
      pos: parsePos(pos),
      meaningVi: meaningVi.trim() || null,
      meaningEn: meaningEn.trim() || null,
      level: aiLevel,
      example: example.trim() || null,
      exampleTranslation: exampleVi.trim() || null,
      audioUrl: null,
      notes: null,
      status,
      tags: [],
      ...(aiFilled.length > 0 && { aiFields: aiFilled }),
    }
    await onAdd(draft)
    resetManual()
  }

  async function handleOfferAdd(entry: DictEntryPreview) {
    await onAdd(draftFromDictEntry(entry))
    resetManual()
  }

  function resetManual() {
    setHeadword(''); setMeaningVi(''); setMeaningEn(''); setIpa(''); setPos(''); setExample(''); setExampleVi(''); setStatus('new')
    setFillError(null); setAiFilled([]); setAiLevel(null); setMatch(null)
  }

  // Empty fields only: anything already typed is the learner's own wording and
  // outranks a guess.
  async function handleAiFill() {
    const word = headword.trim()
    if (!word || filling) return
    setFilling(true)
    setFillError(null)
    try {
      const outcome = await callAi('enrich', { lang: manualLang, headword: word })
      if (outcome.status === 'ok') {
        const d = outcome.data
        const filled: AiField[] = d.level ? ['level'] : []
        const took = (f: AiField, current: string, value: string) => { if (!current && value) filled.push(f) }
        took('meaningVi', meaningVi, d.meaningVi)
        took('ipa', ipa, d.ipa)
        took('pos', pos, formatPos(d.pos))
        took('example', example, d.example)
        took('exampleTranslation', exampleVi, d.exampleVi)
        setAiFilled((xs) => [...new Set([...xs, ...filled])])
        setAiLevel(d.level)
        setMeaningVi((v) => v || d.meaningVi)
        setIpa((v) => v || d.ipa)
        setPos((v) => v || formatPos(d.pos))
        setExample((v) => v || d.example)
        setExampleVi((v) => v || d.exampleVi)
      } else {
        setFillError(outcome.message)
      }
    } catch {
      // `callAi` handles fetch failures; its task-module import can still reject after a redeploy.
      setFillError('Chưa điền được. Thử lại.')
    } finally {
      // Without this the button sticks on "Đang điền…" for the life of the dialog
      // whenever anything throws.
      setFilling(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Thêm từ" titleId="add-word-title" widthClass="max-w-lg">

      {/* Tab bar */}
      <div role="tablist" className={`${s.seg} ${s.tabs}`}>
        <button
          role="tab"
          aria-selected={tab === 'dict'}
          onClick={() => setTab('dict')}
        >
          Từ điển
        </button>
        <button
          role="tab"
          aria-selected={tab === 'manual'}
          onClick={() => setTab('manual')}
        >
          Thủ công
        </button>
      </div>

      <div className="p-5">
        {tab === 'dict' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as LangCode)}
                className={s.field}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Tìm từ…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${s.field} flex-1 min-w-0`}
              />
            </div>

            {/* Debounced results arrive with no other status text, so announce the count
                for screen readers. */}
            <p role="status" aria-live="polite" className="sr-only">
              {query.trim() ? `${results.length} kết quả cho "${query.trim()}"` : ''}
            </p>

            {results.length > 0 && (
              <ul className={s.results}>
                {results.map((entry) => {
                  const saved = savedEntryIds?.has(entry.id) ?? false
                  return (
                    <li key={entry.id}>
                      <div className="min-w-0">
                        <span className={s.hw} data-l={entry.lang} lang={entry.lang}>{entry.headword}</span>
                        <Ipa value={entry.ipa} lang={entry.lang} className={`ml-2 text-xs ${s.pron}`} />
                        {entry.glossVi && <span className="ml-2 text-sm font-semibold">{entry.glossVi}</span>}
                      </div>
                      {saved ? (
                        <span className={`${s.note} shrink-0 pr-2`}>Đã có</span>
                      ) : (
                        <button
                          className={`${s.btn} ${s.sm}`}
                          onClick={() => handleDictAdd(entry)}
                        >
                          Thêm
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {query.trim() && results.length === 0 && (
              <p className={s.note}>
                {searching ? 'Đang tìm…' : refusal ?? 'Không tìm thấy từ này.'}
              </p>
            )}
          </div>
        )}

        {tab === 'manual' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 flex-1 min-w-0">
                <span className={s.label}>Ngôn ngữ</span>
                <select
                  value={manualLang}
                  onChange={(e) => setManualLang(e.target.value as LangCode)}
                  className={s.field}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 flex-1 min-w-0">
                <span className={s.label}>Từ gốc *</span>
                <input
                  type="text"
                  placeholder="Ví dụ: dog"
                  value={headword}
                  onChange={(e) => setHeadword(e.target.value)}
                  className={s.field}
                />
              </label>
            </div>
            {offer && (
              <div className={`${s.alert} flex flex-wrap items-center justify-between gap-2`}>
                <span className="min-w-0">
                  Từ điển có <span className={s.hw} data-l={offer.lang} lang={offer.lang}>{offer.headword}</span>
                  {offer.glossVi && <span className={`ml-2 ${s.note}`}>{offer.glossVi}</span>}
                </span>
                {savedEntryIds?.has(offer.id) ? (
                  <span className={s.note}>Đã có</span>
                ) : (
                  <button type="button" className={`${s.btn} ${s.sm}`} onClick={() => handleOfferAdd(offer)}>
                    Thêm từ từ điển
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 flex-1 min-w-0">
                <span className={s.label}>IPA</span>
                <input
                  type="text"
                  placeholder="/dɔːɡ/"
                  value={ipa}
                  onChange={(e) => { setIpa(e.target.value); unmark('ipa') }}
                  className={s.field}
                />
              </label>
              <label className="flex flex-col gap-1 flex-1 min-w-0">
                <span className={s.label}>Từ loại</span>
                <input
                  type="text"
                  placeholder="noun, verb..."
                  value={pos}
                  onChange={(e) => { setPos(e.target.value); unmark('pos') }}
                  className={s.field}
                />
              </label>
            </div>
            {aiOn && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAiFill}
                  disabled={!headword.trim() || filling}
                  className={`${s.ghost} ${s.sm}`}
                >
                  {filling ? 'Đang điền…' : 'Điền bằng AI'}
                </button>
                <span className={s.note}>
                  {fillError ?? 'Chỉ điền ô còn trống.'}
                </span>
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className={s.label}>Nghĩa tiếng Việt</span>
              <input
                type="text"
                placeholder="con chó"
                value={meaningVi}
                onChange={(e) => { setMeaningVi(e.target.value); unmark('meaningVi') }}
                className={s.field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={s.label}>Nghĩa tiếng Anh</span>
              <input
                type="text"
                placeholder="a domesticated carnivore"
                value={meaningEn}
                onChange={(e) => setMeaningEn(e.target.value)}
                className={s.field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={s.label}>Câu ví dụ</span>
              <input
                type="text"
                placeholder="The dog barked."
                value={example}
                onChange={(e) => { setExample(e.target.value); unmark('example') }}
                className={s.field}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={s.label}>Trạng thái</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WordStatus)}
                className={s.field}
              >
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {status === 'known' && <span className={s.note}>{KNOWN_HINT}</span>}
            </label>
            <button
              className={`${s.btn} mt-1 self-end`}
              onClick={handleManualSave}
            >
              Lưu từ
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
