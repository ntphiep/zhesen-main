'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { Ipa } from '@/components/ui/Ipa'
import { PosTag } from '@/components/ui/PosTag'
import { LinkPending } from '@/components/ui/LinkPending'
import { fetchTextLookup, type TextLookup as TextLookupResult } from '@/lib/dictionary/textLookup'
import { callAi } from '@/lib/ai/browser'
import { useAiEnabled } from '@/lib/hooks/useAiEnabled'

/** The passage cap the route and the `translate` task both enforce. Shown as a counter so
 *  the limit is visible before the paste is refused. */
const MAX_CHARS = 1000

type WordsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: TextLookupResult }
  | { kind: 'error'; message: string }

type TranslationState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; text: string }
  | { kind: 'error'; message: string }

/**
 * Lookup for a phrase, a sentence or a paragraph, in two independent layers.
 *
 * Layer one splits the text and resolves each word against the dictionary, so it answers
 * on a deployment with no assistant at all. Layer two asks the assistant for the passage
 * as a whole and appears only where `aiConfig()` is set; it is abortable, because a
 * paragraph takes longer than the 12 seconds a single word already takes (#10).
 */
export function TextLookup() {
  const aiOn = useAiEnabled()
  const [text, setText] = useState('')
  const [words, setWords] = useState<WordsState>({ kind: 'idle' })
  const [translation, setTranslation] = useState<TranslationState>({ kind: 'idle' })
  const translating = useRef<AbortController | null>(null)

  const trimmed = text.trim()
  const tooLong = trimmed.length > MAX_CHARS

  async function lookUp() {
    if (!trimmed || tooLong) return
    setWords({ kind: 'loading' })
    setTranslation({ kind: 'idle' })
    try {
      const outcome = await fetchTextLookup(trimmed)
      setWords(outcome.status === 'ok'
        ? { kind: 'done', result: outcome.data }
        : { kind: 'error', message: outcome.message })
    } catch {
      setWords({ kind: 'error', message: 'Không tra được đoạn văn bản này. Vui lòng thử lại.' })
    }
  }

  async function translate(lang: TextLookupResult['lang']) {
    const ctrl = new AbortController()
    translating.current = ctrl
    setTranslation({ kind: 'loading' })
    try {
      const outcome = await callAi('translate', { lang, text: trimmed }, ctrl.signal)
      setTranslation(outcome.status === 'ok'
        ? { kind: 'done', text: outcome.data.translationVi }
        : { kind: 'error', message: outcome.message })
    } catch (e) {
      // The learner pressed Huỷ. Back to the button, with nothing said about it.
      setTranslation((e as Error).name === 'AbortError'
        ? { kind: 'idle' }
        : { kind: 'error', message: 'Không hỏi được trợ lý. Vui lòng thử lại.' })
    } finally {
      translating.current = null
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="text-lookup" className="text-sm text-black/60">
          Dán một cụm từ, một câu hoặc cả đoạn văn
        </label>
        <textarea
          id="text-lookup"
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full rounded-xl border border-black/15 px-4 py-3 text-base shadow-sm focus:border-black/40 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={lookUp}
            disabled={!trimmed || tooLong || words.kind === 'loading'}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Tra từng từ
          </button>
          <span className={`text-xs ${tooLong ? 'text-red-600' : 'text-black/40'}`}>
            {trimmed.length}/{MAX_CHARS} ký tự
          </span>
        </div>
      </div>

      {words.kind === 'loading' && <p className="text-sm text-black/40">Đang tra…</p>}
      {words.kind === 'error' && <p className="text-sm text-red-600">{words.message}</p>}

      {words.kind === 'done' && (
        <div className="flex flex-col gap-4">
          {aiOn && (
            <div className="flex flex-col gap-2 rounded-xl border border-black/10 p-4">
              {translation.kind === 'idle' && (
                <button
                  type="button"
                  onClick={() => translate(words.result.lang)}
                  className="self-start rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5"
                >
                  Nhờ trợ lý dịch cả đoạn
                </button>
              )}
              {translation.kind === 'loading' && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-black/40">Trợ lý đang dịch…</span>
                  <button
                    type="button"
                    onClick={() => translating.current?.abort()}
                    className="rounded-lg border border-black/15 px-3 py-1 text-sm hover:bg-black/5"
                  >
                    Huỷ
                  </button>
                </div>
              )}
              {translation.kind === 'error' && <p className="text-sm text-red-600">{translation.message}</p>}
              {translation.kind === 'done' && (
                <>
                  <span className="text-xs font-semibold uppercase tracking-wide text-black/40">
                    Trợ lý dịch, chưa qua từ điển
                  </span>
                  <p className="whitespace-pre-wrap text-base">{translation.text}</p>
                </>
              )}
            </div>
          )}

          {words.result.words.length === 0
            ? <p className="text-sm text-black/40">Không có từ nào để tra trong đoạn này.</p>
            : (
              <ul className="flex flex-col gap-0.5">
                {words.result.words.map((w, i) => (
                  <li key={`${i}-${w.text}`}>
                    {w.entry
                      ? (
                        <Link
                          href={entryPath(w.entry.id)}
                          prefetch={false}
                          className="flex flex-wrap items-baseline gap-2 rounded-lg px-3 py-2 hover:bg-black/5"
                        >
                          <span className="font-medium">{w.text}</span>
                          <Ipa value={w.entry.ipa} lang={w.entry.lang} className="text-xs text-black/40" />
                          <PosTag value={w.entry.pos} className="text-xs text-black/45" />
                          {w.entry.glossVi && <span className="text-sm text-black/60">{w.entry.glossVi}</span>}
                          <LinkPending />
                        </Link>
                      )
                      : (
                        <div className="flex flex-wrap items-baseline gap-2 px-3 py-2">
                          <span className="font-medium text-black/45">{w.text}</span>
                          <span className="text-sm text-black/35">Không có trong từ điển</span>
                        </div>
                      )}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}
