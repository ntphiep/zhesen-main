'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { fetchSearch } from '@/lib/dictionary/searchClient'
import { draftFromDictEntry } from '@/lib/wordlist/store'
import { callAi } from '@/lib/ai/browser'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import { STATUS_OPTIONS, type WordDraft, type WordStatus } from '@/lib/wordlist/types'
import { LANGUAGES, type LangCode } from '@/lib/languages'
import { Ipa } from '@/components/ui/Ipa'

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

  // Clear stale results synchronously as soon as the query is emptied, instead of in an
  // effect (adjust state during render, per react.dev/learn/you-might-not-need-an-effect).
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    if (!query.trim()) setResults([])
  }

  // Clear the previous search whenever the dialog is (re)opened, the same way
  // ImportCsvDialog clears its preview. Modal keeps its children mounted while
  // closed, so without this the box still shows the last word looked up.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setQuery(''); setPrevQuery(''); setResults([]); setFillError(null) }
  }

  useEffect(() => {
    if (!query.trim()) return
    // Abort the in-flight request when the query changes, the same way SearchBox
    // does. Without it a slow request for "cat" could land after a fast one for
    // "cats" and overwrite the list with results for a query no longer typed.
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      try {
        // Through the cached route, like the main search box. Going straight to
        // Supabase from here spent a cross-region round trip per keystroke and
        // skipped both the shared cache and the per-address budget.
        const outcome = await fetchSearch(query, ctrl.signal)
        // Both directions, deduped. The box only read `forward`, so typing the
        // Vietnamese meaning of a word -- the natural thing to do when you know
        // what you want to save but not how it is spelled -- found nothing, even
        // though the route had already answered with it under `reverse`.
        if (outcome.status !== 'ok') { setResults([]); return }
        // A Map keyed by id keeps the first of each and the order they came in,
        // forward before reverse.
        const byId = new Map<string, DictEntryPreview>()
        for (const e of [...outcome.data.forward[lang], ...outcome.data.reverse[lang]]) {
          if (!byId.has(e.id)) byId.set(e.id, e)
        }
        setResults([...byId.values()])
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([])
      }
    }, 250)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [query, lang])

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
      pos: pos.trim() || null,
      meaningVi: meaningVi.trim() || null,
      meaningEn: meaningEn.trim() || null,
      level: null,
      example: example.trim() || null,
      exampleTranslation: exampleVi.trim() || null,
      audioUrl: null,
      notes: null,
      status,
      tags: [],
    }
    await onAdd(draft)
    setHeadword(''); setMeaningVi(''); setMeaningEn(''); setIpa(''); setPos(''); setExample(''); setExampleVi(''); setStatus('new')
    setFillError(null)
  }

  // Fill the empty fields of the manual form from the model. Only the empty ones:
  // anything already typed is the learner's own wording and outranks a guess.
  async function handleAiFill() {
    const word = headword.trim()
    if (!word || filling) return
    setFilling(true)
    setFillError(null)
    try {
      const outcome = await callAi('enrich', { lang: manualLang, headword: word })
      if (outcome.status === 'ok') {
        const d = outcome.data
        setMeaningVi((v) => v || d.meaningVi)
        setIpa((v) => v || d.ipa)
        setPos((v) => v || d.pos)
        setExample((v) => v || d.example)
        setExampleVi((v) => v || d.exampleVi)
      } else {
        setFillError(outcome.message)
      }
    } finally {
      // Without this the button sticks on "Đang điền…" for the life of the
      // dialog if anything throws, and only closing and reopening frees it.
      setFilling(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Thêm từ mới" titleId="add-word-title" widthClass="max-w-lg">

      {/* Tab bar */}
      <div role="tablist" className="flex gap-1 px-5 pt-3 pb-0 border-b border-black/10">
        <button
          role="tab"
          aria-selected={tab === 'dict'}
          className={`px-3 py-1.5 text-sm rounded-t-lg font-medium transition-colors ${tab === 'dict' ? 'bg-black text-white' : 'text-black/50 hover:text-black/80'}`}
          onClick={() => setTab('dict')}
        >
          Từ điển
        </button>
        <button
          role="tab"
          aria-selected={tab === 'manual'}
          className={`px-3 py-1.5 text-sm rounded-t-lg font-medium transition-colors ${tab === 'manual' ? 'bg-black text-white' : 'text-black/50 hover:text-black/80'}`}
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
                className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Tìm từ..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </div>

            {/* Debounced search results update with no other status text -- announce the
                count for screen readers, same pattern as SearchBox. */}
            <p role="status" aria-live="polite" className="sr-only">
              {query.trim() ? `${results.length} kết quả cho "${query.trim()}"` : ''}
            </p>

            {results.length > 0 && (
              <ul className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                {results.map((entry) => {
                  const saved = savedEntryIds?.has(entry.id) ?? false
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg bg-black/5 px-3 py-2"
                    >
                      <div>
                        <span className="font-medium">{entry.headword}</span>
                        <Ipa value={entry.ipa} lang={entry.lang} className="ml-2 text-xs text-black/50" />
                        {entry.glossVi && <span className="ml-2 text-sm text-black/60">{entry.glossVi}</span>}
                      </div>
                      {saved ? (
                        <span className="ml-3 shrink-0 text-sm text-black/40">Đã có</span>
                      ) : (
                        <button
                          className="ml-3 shrink-0 rounded-lg bg-black px-3 py-1 text-sm text-white"
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
              <p className="text-sm text-black/40">Không tìm thấy kết quả.</p>
            )}
          </div>
        )}

        {tab === 'manual' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-black/50">Ngôn ngữ</span>
                <select
                  value={manualLang}
                  onChange={(e) => setManualLang(e.target.value as LangCode)}
                  className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-black/50">Từ gốc *</span>
                <input
                  type="text"
                  placeholder="Ví dụ: dog"
                  value={headword}
                  onChange={(e) => setHeadword(e.target.value)}
                  className="rounded-lg border border-black/15 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-black/50">IPA</span>
                <input
                  type="text"
                  placeholder="/dɔːɡ/"
                  value={ipa}
                  onChange={(e) => setIpa(e.target.value)}
                  className="rounded-lg border border-black/15 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-black/50">Từ loại</span>
                <input
                  type="text"
                  placeholder="noun, verb..."
                  value={pos}
                  onChange={(e) => setPos(e.target.value)}
                  className="rounded-lg border border-black/15 px-3 py-2 text-sm"
                />
              </label>
            </div>
            {aiOn && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAiFill}
                  disabled={!headword.trim() || filling}
                  className="rounded-lg border border-black/15 px-3 py-1.5 text-xs font-medium text-black/70 hover:bg-black/5 disabled:opacity-40"
                >
                  {filling ? 'Đang điền…' : 'Điền bằng AI'}
                </button>
                <span className="text-xs text-black/40">
                  {fillError ?? 'Chỉ điền vào ô còn trống.'}
                </span>
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs text-black/50">Nghĩa tiếng Việt</span>
              <input
                type="text"
                placeholder="con chó"
                value={meaningVi}
                onChange={(e) => setMeaningVi(e.target.value)}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-black/50">Nghĩa tiếng Anh</span>
              <input
                type="text"
                placeholder="a domesticated carnivore"
                value={meaningEn}
                onChange={(e) => setMeaningEn(e.target.value)}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-black/50">Câu ví dụ</span>
              <input
                type="text"
                placeholder="The dog barked."
                value={example}
                onChange={(e) => setExample(e.target.value)}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-black/50">Trạng thái</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WordStatus)}
                className="rounded-lg border border-black/15 px-3 py-2 text-sm bg-white"
              >
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <button
              className="mt-1 rounded-lg bg-black px-4 py-2 text-sm text-white self-end"
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
