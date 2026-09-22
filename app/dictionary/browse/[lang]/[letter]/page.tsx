import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { LANG_CODES, getLanguage, isLangCode } from '@/lib/languages'
import { LANG_LABELS } from '@/lib/dictionary/labels'
import { entryPath } from '@/lib/dictionary/entryId'
import { BROWSE_LETTERS, isBrowseLetter } from '@/lib/dictionary/browse'
import { getCachedEntriesByLetter } from '@/lib/dictionary/cached'
import { Ipa } from '@/components/ui/Ipa'
import { PosTag } from '@/components/ui/PosTag'
import { pageMetadata } from '@/lib/site'

/**
 * The dictionary as an index: every entry whose first letter is the one asked for, most
 * frequent first.
 *
 * Chinese has no Latin headword, so its letter is the first letter of the pinyin. That is
 * stated on the page rather than assumed, because "duyệt theo chữ cái" reads as nonsense
 * over Han text otherwise.
 */

/** Empty, and that is enough: a dynamic segment does not enter the route cache without
 *  this export, and `dynamicParams` defaults to true, so the pages are filled in on
 *  first request and kept. */
export function generateStaticParams(): { lang: string; letter: string }[] {
  return []
}

// One week, the literal value of `LEX_REVALIDATE` in `lib/dictionary/cached.ts`,
// which the data caches under this page use and which explains the figure. Written
// out because a segment config must be statically analysable: importing the constant
// fails the build with "Invalid segment configuration export detected".
export const revalidate = 604800

/** One page is as much as this list ever shows. Beyond it the letter is not the right way
 *  in any more and the search box is. */
const PAGE_SIZE = 120

export async function generateMetadata(
  { params }: { params: Promise<{ lang: string; letter: string }> },
): Promise<Metadata> {
  const { lang, letter } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language || !isBrowseLetter(letter)) return {}
  return pageMetadata({
    title: `${language.name}: chữ ${letter.toUpperCase()}`,
    description: `Từ ${language.name} bắt đầu bằng chữ ${letter.toUpperCase()}, xếp theo độ thông dụng.`,
    canonical: `/dictionary/browse/${language.code}/${letter}`,
  })
}

export default async function Page({ params }: { params: Promise<{ lang: string; letter: string }> }) {
  const { lang, letter } = await params
  const language = isLangCode(lang) ? getLanguage(lang) : undefined
  if (!language || !isBrowseLetter(letter)) notFound()

  const { items, total } = await getCachedEntriesByLetter(language.code, letter, 0, PAGE_SIZE)
  const upper = letter.toUpperCase()

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/dictionary" className="text-sm text-black/50 hover:underline">← Dịch</Link>

      <h1 className="mt-3 text-3xl font-bold">
        {language.name}, chữ {upper}
      </h1>
      <p className="mt-1 text-sm text-black/55">
        {total.toLocaleString('vi-VN')} từ
        {language.code === 'zh' && ' — chữ cái ở đây là chữ đầu của phiên âm pinyin'}
      </p>

      <nav aria-label="Ngôn ngữ" className="mt-6 inline-flex overflow-hidden rounded-lg border border-black/15">
        {LANG_CODES.map((l, i) => (
          <Link
            key={l}
            href={`/dictionary/browse/${l}/${letter}`}
            prefetch={false}
            aria-current={l === language.code ? 'page' : undefined}
            className={`px-3 py-1.5 text-xs ${i > 0 ? 'border-l border-black/15' : ''} ${
              l === language.code ? 'bg-black font-medium text-white' : 'text-black/55 hover:bg-black/5'
            }`}
          >
            {LANG_LABELS[l]}
          </Link>
        ))}
      </nav>

      <nav aria-label="Chữ cái đầu" className="mt-4 flex flex-wrap gap-1.5">
        {BROWSE_LETTERS.map((l) => (
          <Link
            key={l}
            href={`/dictionary/browse/${language.code}/${l}`}
            prefetch={false}
            aria-current={l === letter ? 'page' : undefined}
            className={`w-8 rounded-lg border py-1 text-center text-sm uppercase ${
              l === letter ? 'border-black/40 bg-black/5 font-medium' : 'border-black/10 text-black/70 hover:bg-black/5'
            }`}
          >
            {l}
          </Link>
        ))}
      </nav>

      {items.length === 0
        ? <p className="mt-8 text-sm text-black/45">Chưa có từ nào bắt đầu bằng chữ {upper}.</p>
        : (
          <ul className="mt-8 grid gap-1 sm:grid-cols-2">
            {items.map((e) => (
              <li key={e.id}>
                <Link
                  href={entryPath(e.id)}
                  prefetch={false}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-3 py-2 hover:bg-black/5"
                >
                  <span className="font-medium">{e.headword}</span>
                  <Ipa value={e.ipa} lang={e.lang} className="text-xs text-black/40" />
                  <PosTag value={e.pos} className="text-xs text-black/45" />
                  {e.glossVi && <span className="text-sm text-black/60">{e.glossVi}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}

      {total > items.length && (
        <p className="mt-6 text-sm text-black/45">
          Đang hiển thị {items.length} từ thông dụng nhất. Gõ vào ô dịch để tìm từ cụ thể.
        </p>
      )}
    </main>
  )
}
