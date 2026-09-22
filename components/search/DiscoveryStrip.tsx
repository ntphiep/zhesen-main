import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { getCachedCommonWords } from '@/lib/dictionary/cached'
import { BROWSE_LETTERS } from '@/lib/dictionary/browse'
import { LANG_CODES } from '@/lib/languages'

/**
 * What the page offers when nothing has been typed: the words a learner meets first in
 * each language, and an index into the dictionary itself.
 *
 * Every read here is cached for a week under the `lex` tag, so the strip costs one
 * database round trip per language on a cold render and nothing afterwards.
 */

/** Enough to show what a language looks like without wrapping to a third line at 1440px. */
const PER_LANG = 10

/** Where in the frequency list to start. The first three hundred ranks of all three
 *  languages are function words -- the, to, and, de, la, que, 的, 是 -- so a strip drawn
 *  from the top of the list offered nothing worth tapping. From 301, and with `leveled`
 *  dropping the uncurated rows, the list reads important, news, book, friends. */
const SKIP_FUNCTION_WORDS = 300

/** The index is drawn once and starts on English, the largest of the three. The browse
 *  page carries the language tabs, so one row of letters serves all three. */
const INDEX_LANG = 'en'

export async function DiscoveryStrip() {
  const lists = await Promise.all(
    LANG_CODES.map((l) =>
      getCachedCommonWords(l, { limit: PER_LANG, offset: SKIP_FUNCTION_WORDS, leveled: true })),
  )

  return (
    <section className="mt-14 border-t border-black/10 pt-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-black/40">Từ thông dụng</h2>
      <div className="mt-3 flex flex-col gap-2">
        {LANG_CODES.map((l, i) => (
          <div key={l} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="w-24 shrink-0 text-xs text-black/40">{LANG_LABELS[l]}</span>
            {lists[i].map((e) => (
              <Link
                key={e.id}
                href={entryPath(e.id)}
                prefetch={false}
                className="rounded-full border border-black/10 px-3 py-1 text-sm hover:bg-black/5"
                title={e.glossVi ?? undefined}
              >
                {e.headword}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-black/40">Duyệt từ điển</h2>
      <nav aria-label="Duyệt từ điển theo chữ cái đầu" className="mt-3 flex flex-wrap gap-1.5">
        {BROWSE_LETTERS.map((letter) => (
          <Link
            key={letter}
            href={`/dictionary/browse/${INDEX_LANG}/${letter}`}
            prefetch={false}
            className="w-8 rounded-lg border border-black/10 py-1 text-center text-sm uppercase text-black/70 hover:bg-black/5"
          >
            {letter}
          </Link>
        ))}
      </nav>
    </section>
  )
}
