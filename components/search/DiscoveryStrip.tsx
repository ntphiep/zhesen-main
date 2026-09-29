import { CommonWords, type WordChip } from './CommonWords'
import { PersonalStrip } from './PersonalStrip'
import { getCachedCommonWords } from '@/lib/dictionary/cached'
import { LANG_CODES, type LangCode } from '@/lib/languages'

/**
 * What the page offers when nothing has been typed: a rotating row of common words per
 * language, then what this reader has looked up and saved.
 *
 * Every read here is cached for a week under the `lex` tag, so the strip costs one
 * database round trip per language on a cold render and nothing afterwards.
 */

/** Six rows of ten, so the strip keeps showing something new for about half a minute. */
const POOL = 60

/** Where in the frequency list to start. The first three hundred ranks of all three
 *  languages are function words -- the, to, and, de, la, que, 的, 是 -- so a strip drawn
 *  from the top of the list offered nothing worth tapping. From 301, and with `leveled`
 *  dropping the uncurated rows, the list reads important, news, book, friends. */
const SKIP_FUNCTION_WORDS = 300

export async function DiscoveryStrip() {
  const lists = await Promise.all(
    LANG_CODES.map((l) =>
      getCachedCommonWords(l, { limit: POOL, offset: SKIP_FUNCTION_WORDS, leveled: true })),
  )
  const pools = Object.fromEntries(
    LANG_CODES.map((l, i) => [
      l,
      lists[i].map((e): WordChip => ({ id: e.id, headword: e.headword, glossVi: e.glossVi ?? null })),
    ]),
  ) as Record<LangCode, WordChip[]>

  return (
    <section className="mt-14 flex flex-col gap-8 rounded-[22px] bg-(--tint-2) px-4 py-5 sm:px-6 sm:py-6">
      <CommonWords pools={pools} />
      <PersonalStrip />
    </section>
  )
}
