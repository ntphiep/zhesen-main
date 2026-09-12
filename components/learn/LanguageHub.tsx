import Link from 'next/link'
import { SearchBox } from '@/components/search/SearchBox'
import { entryPath } from '@/lib/dictionary/entryId'
import { LANG_FLAGS } from '@/lib/dictionary/labels'
import type { Language } from '@/lib/languages'
import type { DictEntryPreview } from '@/lib/dictionary/types'

/** Per-language hub: a search scoped to this language, the practice entry point, and
 * a list of common words to study. */
export function LanguageHub({ language, common }: { language: Language; common: DictEntryPreview[] }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-3xl">{LANG_FLAGS[language.code]}</span>
        <h1 className="text-3xl font-bold">{language.name}</h1>
      </div>

      <div className="mt-6">
        <SearchBox lang={language.code} />
      </div>
      <div className="mt-3">
        <Link href="/practice" className="inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
          Luyện tập từ đã lưu →
        </Link>
      </div>

      {common.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/40">Từ thông dụng</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {common.map((e) => (
              <Link
                key={e.id}
                href={entryPath(e.id)}
                className="flex items-baseline gap-2 rounded-lg border border-black/10 px-4 py-2 hover:bg-black/5"
              >
                <span className="font-medium">{e.headword}</span>
                {e.ipa && <span className="ipa text-xs text-black/40">{e.ipa}</span>}
                {e.glossVi && <span className="truncate text-sm text-black/55">{e.glossVi}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
