'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { Ipa } from '@/components/ui/Ipa'
import { PosTag } from '@/components/ui/PosTag'
import { LinkPending } from '@/components/ui/LinkPending'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { TappableText } from '@/components/reader/TappableText'
import { fetchTextLookup } from '@/lib/dictionary/textLookupClient'
import type { TextLookup } from '@/lib/dictionary/textLookup'
import { fetchTranslation } from '@/lib/translate/client'
import { fetchSearch } from '@/lib/dictionary/searchClient'
import { isWordMatch } from '@/lib/dictionary/detect'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { TranslateLangCode } from '@/lib/translate/azure'
import type { Direction } from '@/lib/dictionary/search'
import { isLangCode, type LangCode } from '@/lib/languages'
import s from './Lookup.module.css'
import { ErrorLine } from './ErrorLine'

/** The ceiling `POST /dictionary/translate` enforces, and the same one Google Translate's
 *  web page uses. The counter appears only near it, because a two-word query does not need
 *  to be told it is under a five-thousand-character limit. */
export const MAX_PASSAGE_CHARS = 5000

/** `POST /dictionary/text/lookup` resolves every word against the dictionary, so it keeps
 *  the lower ceiling: the per-word list is an extra, and a five-thousand-character paste
 *  would make it the slowest thing on the page. */
export const MAX_WORDLIST_CHARS = 1000

/** The part of a passage the word list reads: the first MAX_WORDLIST_CHARS, cut at the
 *  last whitespace so no word is halved. Han text carries none and is cut at the ceiling,
 *  never between the two halves of a surrogate pair. */
export function wordListPart(text: string): string {
  if (text.length <= MAX_WORDLIST_CHARS) return text
  const space = text.slice(0, MAX_WORDLIST_CHARS + 1).search(/\s\S*$/)
  let cut = space > MAX_WORDLIST_CHARS / 2 ? space : MAX_WORDLIST_CHARS
  if (/[\uD800-\uDBFF]/.test(text[cut - 1])) cut--
  return text.slice(0, cut).trimEnd()
}

/** Two words is where one dictionary entry stops being the whole answer. It used to be
 *  three, which left a gap: at two words the panel had no translation to show and said
 *  "Chưa tìm thấy từ nào" instead, then replaced that with "Đang dịch…" on the third word.
 *  Han text carries no spaces, so it is counted in characters. */
export function looksLikeAPassage(q: string, direction: Direction): boolean {
  if (direction === 'fw' && /\p{Script=Han}/u.test(q)) return q.length >= 4
  return q.trim().split(/\s+/).length >= 2
}

/** Words a foreign phrase headword runs to: "at the end of the day" is six. */
const MAX_PHRASE_WORDS = 6
/** The search route cuts a query at 64 characters. */
const MAX_PHRASE_CHARS = 64

/** A passage short enough to be a headword itself, so the dictionary is searched as well as
 *  the text translated: "give up" and "look forward to" are entries. Sentence punctuation
 *  means a sentence. A Vietnamese word is mostly two syllables ("bỏ cuộc", "mong đợi"), and
 *  three words is where the Vietnamese lookup starts scoring a sentence term by term. */
export function looksLikeAPhrase(q: string, direction: Direction): boolean {
  const t = q.trim()
  if (!looksLikeAPassage(t, direction) || /\p{Script=Han}/u.test(t) || /[.,!?;:…"“”()]/u.test(t)) return false
  const words = t.split(/\s+/).length
  return direction === 'vi' ? words === 2 : words <= MAX_PHRASE_WORDS && t.length <= MAX_PHRASE_CHARS
}

/** A translation is a whole extra request, so it waits for the typing to stop rather than
 *  following each keystroke: a 200-character passage typed out would otherwise spend the
 *  monthly quota on forty prefixes of itself. */
const TRANSLATE_DEBOUNCE_MS = 900

/** A translation this short names a word or a phrase rather than a sentence, so the
 *  dictionary is searched for it: "người tham dự" comes back as "Attendees", and attendee
 *  has no Vietnamese meaning the Vietnamese lookup could match. */
const MAX_LOOKUP_WORDS = 3

/** A word row on the block's pastel ground. */
const ROW = 'flex flex-wrap items-baseline gap-2 rounded-xl px-2 py-1.5 transition-colors duration-150 ease-std hover:bg-(--zs-bg)'

/** `text` is the passage a settled state answers: the previous answer stays on screen
 *  through the debounce, and the word list must not read its language as this one's. */
type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; text: string; from: string; translations: Partial<Record<TranslateLangCode, string>> }
  | { kind: 'disabled'; text: string }
  | { kind: 'error'; text: string; message: string }

/**
 * The whole-passage half of a lookup panel: a machine translation of the text, and, for a
 * passage written in one of the three dictionary languages, every word in it resolved
 * against the dictionary underneath.
 *
 * The Vietnamese direction gets no word list: the dictionary indexes no Vietnamese
 * headwords, so there is nothing to link each word to.
 */
export function PassageBlock({ text, direction, targets, known }: {
  text: string
  direction: Direction
  targets: readonly LangCode[]
  /** Entries the panel already lists for the same text, which the translation's own hits
   *  leave out rather than repeat. */
  known?: ReadonlySet<string>
}) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [words, setWords] = useState<TextLookup | null>(null)
  // Keyed by the translation each list answers, so a list never outlives its translation.
  const [found, setFound] = useState<Partial<Record<LangCode, { text: string; entries: DictEntryPreview[] }>>>({})

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
          setState({ kind: 'done', text: trimmed, from: outcome.from, translations: outcome.translations })
        }
        else if (outcome.status === 'disabled') setState({ kind: 'disabled', text: trimmed })
        else setState({ kind: 'error', text: trimmed, message: outcome.message })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setState({ kind: 'error', text: trimmed, message: 'Chưa dịch được đoạn này. Thử lại.' })
        }
      }
    }, TRANSLATE_DEBOUNCE_MS)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [trimmed, tooLong, to])

  // The word list waits for the translation, because Azure's detected language decides how
  // the passage is read: the letter rule took 30.5% of Spanish sentences for English. With
  // no detection it takes the one selected language, else the route's letter rule. Azure
  // answered after the typing stopped, so that path needs no debounce of its own.
  const settled = tooLong || (state.kind !== 'idle' && state.kind !== 'loading' && state.text === trimmed)
  const detected = state.kind === 'done' && isLangCode(state.from) ? state.from : undefined
  const wordLang = detected ?? (targets.length === 1 ? targets[0] : undefined)
  const listed = wordListPart(trimmed)
  useEffect(() => {
    if (direction !== 'fw' || !settled) return
    const ctrl = new AbortController()
    const id = setTimeout(async () => {
      try {
        const outcome = await fetchTextLookup(listed, ctrl.signal, wordLang)
        setWords(outcome.status === 'ok' ? outcome.data : null)
      } catch {
        setWords(null)
      }
    }, tooLong ? TRANSLATE_DEBOUNCE_MS : 0)
    return () => { clearTimeout(id); ctrl.abort() }
  }, [direction, listed, settled, tooLong, wordLang])

  // Reuses the translation this block already holds: no second Azure request, and each
  // search goes through the cached route.
  useEffect(() => {
    if (direction !== 'vi' || state.kind !== 'done') return
    const asks = targets.flatMap((l) => {
      const text = state.translations[l]?.trim().replace(/[.。]$/, '')
      return text && state.from !== l && text.split(/\s+/).length <= MAX_LOOKUP_WORDS ? [[l, text] as const] : []
    })
    if (asks.length === 0) return
    const ctrl = new AbortController()
    Promise.all(asks.map(async ([l, text]) => {
      const outcome = await fetchSearch(text, ctrl.signal, { langs: [l] })
      const entries = outcome.status === 'ok' ? outcome.data.entries[l].filter(isWordMatch) : []
      return [l, { text: state.translations[l] ?? '', entries }] as const
    }))
      .then((pairs) => setFound(Object.fromEntries(pairs)))
      .catch(() => {})
    return () => ctrl.abort()
  }, [direction, state, targets])

  if (!trimmed) return null
  const unseen = (list: DictEntryPreview[]) => (known ? list.filter((e) => !known.has(e.id)) : list)
  // "give up" typed alone is already the panel's own top hit.
  const phrases = (words?.phrases ?? []).filter((p) => !known?.has(p.entry.id))

  return (
    <section className={`${s.rise} flex flex-col gap-3 rounded-[18px] bg-(--tint-2) p-4 sm:p-5`}>
      {(nearLimit || tooLong) && (
        <span className={`text-xs ${tooLong ? 'font-extrabold text-(--zs-ink)' : 'font-semibold text-(--zs-soft)'}`}>
          {trimmed.length}/{MAX_PASSAGE_CHARS} ký tự
        </span>
      )}

      {tooLong && <ErrorLine>Đoạn này quá dài để dịch.</ErrorLine>}
      {state.kind === 'loading' && <p className="text-sm text-(--zs-soft)">Đang dịch…</p>}
      {state.kind === 'disabled' && (
        <p className="text-sm text-(--zs-soft)">Chưa hỗ trợ dịch cả đoạn.</p>
      )}
      {state.kind === 'error' && <ErrorLine>{state.message}</ErrorLine>}

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
                <dt className="text-xs font-bold tracking-[0.02em] text-(--zs-soft)">
                  {l === 'vi' ? 'Tiếng Việt' : LANG_LABELS[l]}
                  {untouched && <span className="ml-2 font-normal">nguyên văn</span>}
                </dt>
                <dd className="m-0 whitespace-pre-wrap text-[1.0625rem] text-(--zs-ink)">
                  {/* Every word the dictionary holds is tappable, the same popover the
                      example sentences on a word page use. Vietnamese has no headwords
                      indexed, so that direction stays plain text. */}
                  {l === 'vi' || untouched
                    ? value
                    : <TappableText text={value} lang={l} translation={trimmed} />}
                </dd>
                {l !== 'vi' && found[l]?.text === value && unseen(found[l].entries).length > 0 && (
                  <dd className="m-0 mt-1 flex flex-col gap-0.5">
                    <span className="text-xs text-(--zs-soft)">Dịch máy: {value}</span>
                    <ul className="flex flex-col gap-0.5">
                      {unseen(found[l].entries).map((e) => (
                        <li key={e.id}>
                          <Link
                            href={entryPath(e.id)}
                            prefetch={false}
                            className={ROW}
                          >
                            <span data-hw="" lang={e.lang} className="text-[1.0625rem]">{e.headword}</span>
                            <Ipa value={e.ipa} lang={e.lang} className="text-xs text-(--zs-soft)" />
                            <PosTag value={e.pos} className="text-xs text-(--zs-soft)" />
                            {e.glossVi && <span className="text-sm font-semibold">{e.glossVi}</span>}
                            <LinkPending />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </dd>
                )}
              </div>
            )
          })}
        </dl>
      )}

      {/* A phrasal verb or a fixed phrase is one meaning, which the word list below splits
          into words that each mean something else: "gave up" is not give plus up. */}
      {phrases.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-[0.02em] text-(--zs-soft)">Cụm từ trong đoạn</span>
          <ul className="flex flex-col gap-0.5">
            {phrases.map((p) => (
              <li key={p.entry.id}>
                <Link href={entryPath(p.entry.id)} prefetch={false} className={ROW}>
                  <span data-hw="" lang={p.entry.lang} className="text-[1.0625rem]">{p.entry.headword}</span>
                  {p.text.toLowerCase() !== p.entry.headword.toLowerCase() && (
                    <span lang={p.entry.lang} className="text-xs text-(--zs-soft)">{p.text}</span>
                  )}
                  <PosTag value={p.entry.pos} className="text-xs text-(--zs-soft)" />
                  {p.entry.glossVi && <span className="text-sm font-semibold">{p.entry.glossVi}</span>}
                  <LinkPending />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {words && words.words.length > 0 && listed !== trimmed && (
        <p className="text-xs text-(--zs-soft)">Chỉ tra từng từ trong 1.000 ký tự đầu.</p>
      )}
      {words && words.words.length > 0 && (
        <details>
          <summary className="cursor-pointer rounded-md text-sm font-semibold text-(--zs-ink)">Từng từ trong đoạn</summary>
          <ul className="mt-2 flex flex-col gap-0.5">
            {words.words.map((w, i) => (
              <li key={`${i}-${w.text}`}>
                {w.entry
                  ? (
                    <Link
                      href={entryPath(w.entry.id)}
                      prefetch={false}
                      className={ROW}
                    >
                      <span data-hw="" lang={w.entry.lang} className="text-[1.0625rem]">{w.text}</span>
                      <Ipa value={w.entry.ipa} lang={w.entry.lang} className="text-xs text-(--zs-soft)" />
                      <PosTag value={w.entry.pos} className="text-xs text-(--zs-soft)" />
                      {w.entry.glossVi && <span className="text-sm font-semibold">{w.entry.glossVi}</span>}
                      <LinkPending />
                    </Link>
                  )
                  : (
                    <div className="flex flex-wrap items-baseline gap-2 px-2 py-1.5">
                      <span className="text-[1.0625rem] text-(--zs-soft)">{w.text}</span>
                      <span className="text-sm text-(--zs-soft)">Không có trong từ điển</span>
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
