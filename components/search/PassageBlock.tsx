'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { Ipa } from '@/components/ui/Ipa'
import { PosTag } from '@/components/ui/PosTag'
import { LinkPending } from '@/components/ui/LinkPending'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { TappableText } from '@/components/reader/TappableText'
import { fetchTextLookup, type TextLookup } from '@/lib/dictionary/textLookup'
import { fetchTranslation } from '@/lib/translate/client'
import type { TranslateLangCode } from '@/lib/translate/azure'
import type { Direction } from '@/lib/dictionary/search'
import type { LangCode } from '@/lib/languages'

/** The ceiling `POST /dictionary/translate` enforces, and the same one Google Translate's
 *  web page uses. The counter appears only near it, because a two-word query does not need
 *  to be told it is under a five-thousand-character limit. */
export const MAX_PASSAGE_CHARS = 5000

/** `POST /dictionary/text/lookup` resolves every word against the dictionary, so it keeps
 *  the lower ceiling: the per-word list is an extra, and a five-thousand-character paste
 *  would make it the slowest thing on the page. */
export const MAX_WORDLIST_CHARS = 1000

/** Two words is where one dictionary entry stops being the whole answer. It used to be
 *  three, which left a gap: at two words the panel had no translation to show and said
 *  "Chưa tìm thấy từ nào" instead, then replaced that with "Đang dịch…" on the third word.
 *  Han text carries no spaces, so it is counted in characters. */
export function looksLikeAPassage(q: string, direction: Direction): boolean {
  if (direction === 'fw' && /\p{Script=Han}/u.test(q)) return q.length >= 4
  return q.trim().split(/\s+/).length >= 2
}

/** A translation is a whole extra request, so it waits for the typing to stop rather than
 *  following each keystroke: a 200-character passage typed out would otherwise spend the
 *  monthly quota on forty prefixes of itself. */
const TRANSLATE_DEBOUNCE_MS = 900

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; from: string; translations: Partial<Record<TranslateLangCode, string>> }
  | { kind: 'disabled' }
  | { kind: 'error'; message: string }

/**
 * The whole-passage half of a lookup panel: a machine translation of the text, and, for a
 * passage written in one of the three dictionary languages, every word in it resolved
 * against the dictionary underneath.
 *
 * The Vietnamese direction gets no word list: the dictionary indexes no Vietnamese
 * headwords, so there is nothing to link each word to.
 */
export function PassageBlock({ text, direction, targets }: {
  text: string
  direction: Direction
  targets: readonly LangCode[]
}) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [words, setWords] = useState<TextLookup | null>(null)

  const trimmed = text.trim()
  const tooLong = trimmed.length > MAX_PASSAGE_CHARS
  const nearLimit = trimmed.length > MAX_PASSAGE_CHARS - 500
  // Memoised so the effect below does not refire on every render: a fresh array literal
  // is a new dependency each time.
  const to = useMemo<TranslateLangCode[]>(
    () => (direction === 'vi' ? [...targets] : ['vi']),
    [direction, targets],
  )

  // Every setState sits inside the timeout, never in the effect body: the previous
  // answer stays on screen for the debounce rather than blanking on each keystroke, and
  // react-hooks/set-state-in-effect forbids the synchronous form.
  useEffect(() => {
    if (tooLong) return
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      setState({ kind: 'loading' })
      try {
        // No source language is sent: Azure detects it. See fetchTranslation's own note.
        const outcome = await fetchTranslation(trimmed, undefined, to, ctrl.signal)
        if (outcome.status === 'ok') {
          setState({ kind: 'done', from: outcome.from, translations: outcome.translations })
        }
        else if (outcome.status === 'disabled') setState({ kind: 'disabled' })
        else setState({ kind: 'error', message: outcome.message })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setState({ kind: 'error', message: 'Chưa dịch được đoạn này. Vui lòng thử lại.' })
        }
      }
    }, TRANSLATE_DEBOUNCE_MS)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [trimmed, tooLong, to])

  // The word list is a different request to a different route, and it answers whether or
  // not Azure is configured, so it does not wait on the translation.
  useEffect(() => {
    if (direction !== 'fw' || trimmed.length > MAX_WORDLIST_CHARS) return
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      try {
        const outcome = await fetchTextLookup(trimmed, ctrl.signal)
        setWords(outcome.status === 'ok' ? outcome.data : null)
      } catch {
        setWords(null)
      }
    }, TRANSLATE_DEBOUNCE_MS)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [direction, trimmed])

  if (!trimmed) return null

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-black/10 p-4">
      {(nearLimit || tooLong) && (
        <span className={`text-xs ${tooLong ? 'text-red-600' : 'text-black/35'}`}>
          {trimmed.length}/{MAX_PASSAGE_CHARS} ký tự
        </span>
      )}

      {tooLong && <p className="text-sm text-red-600">Đoạn này dài quá giới hạn dịch.</p>}
      {state.kind === 'loading' && <p className="text-sm text-black/40">Đang dịch…</p>}
      {state.kind === 'disabled' && (
        <p className="text-sm text-black/40">Bản triển khai này chưa bật dịch cả đoạn.</p>
      )}
      {state.kind === 'error' && <p className="text-sm text-red-600">{state.message}</p>}

      {state.kind === 'done' && (
        <dl className="flex flex-col gap-2">
          {(direction === 'vi' ? targets : (['vi'] as const)).map((l) => {
            const value = state.translations[l]
            if (!value) return null
            // Azure answers a request whose target is the language it detected by echoing
            // the text back. Saying so is the honest label; dropping the row would leave
            // the block empty when that is the only target.
            const untouched = state.from === l
            return (
              <div key={l} className="flex flex-col gap-0.5">
                <dt className="text-xs uppercase tracking-wide text-black/40">
                  {l === 'vi' ? 'Tiếng Việt' : LANG_LABELS[l]}
                  {untouched && <span className="ml-2 normal-case text-black/30">nguyên văn</span>}
                </dt>
                <dd className="m-0 whitespace-pre-wrap text-base">
                  {/* Every word the dictionary holds is tappable, the same popover the
                      example sentences on a word page use. Vietnamese has no headwords
                      indexed, so that direction stays plain text. */}
                  {l === 'vi' || untouched
                    ? value
                    : <TappableText text={value} lang={l} />}
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      {words && words.words.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-black/60">Từng từ trong đoạn</summary>
          <ul className="mt-2 flex flex-col gap-0.5">
            {words.words.map((w, i) => (
              <li key={`${i}-${w.text}`}>
                {w.entry
                  ? (
                    <Link
                      href={entryPath(w.entry.id)}
                      prefetch={false}
                      className="flex flex-wrap items-baseline gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5"
                    >
                      <span className="font-medium">{w.text}</span>
                      <Ipa value={w.entry.ipa} lang={w.entry.lang} className="text-xs text-black/40" />
                      <PosTag value={w.entry.pos} className="text-xs text-black/45" />
                      {w.entry.glossVi && <span className="text-sm text-black/60">{w.entry.glossVi}</span>}
                      <LinkPending />
                    </Link>
                  )
                  : (
                    <div className="flex flex-wrap items-baseline gap-2 px-2 py-1.5">
                      <span className="font-medium text-black/45">{w.text}</span>
                      <span className="text-sm text-black/35">Không có trong từ điển</span>
                    </div>
                  )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
