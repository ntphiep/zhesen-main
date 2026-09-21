import Link from 'next/link'
import { Ipa } from '@/components/ui/Ipa'
import { LookupPair } from '@/components/search/LookupPair'
import { entryPath } from '@/lib/dictionary/entryId'
import { LinkPending } from '@/components/ui/LinkPending'
import type { Language } from '@/lib/languages'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { LevelSummary } from '@/lib/dictionary/levels'

/** Per-language hub: a search scoped to this language, the practice entry point, a
 * chip row to browse vocabulary by level, and a list of common words to study. */
export function LanguageHub({ language, common, levels }: { language: Language; common: DictEntryPreview[]; levels: LevelSummary[] }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-black/50 hover:underline">← Trang chủ</Link>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xl font-medium text-black/70">{language.nativeName}</span>
        <h1 className="text-3xl font-bold">{language.name}</h1>
      </div>

      <div className="mt-6">
        <LookupPair lang={language.code} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/practice" className="inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
          Luyện tập từ đã lưu →
        </Link>
        <Link href={`/grammar/${language.code}`} className="inline-block rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/70 hover:bg-black/5">
          Ngữ pháp {language.name} →
        </Link>
      </div>

      {levels.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/40">Duyệt theo cấp độ</h2>
          <div className="flex flex-wrap gap-2">
            {levels.map((l) => (
              <Link
                key={l.level}
                href={`/learn/${language.code}/${encodeURIComponent(l.level)}`}
                className="rounded-full border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5"
              >
                {l.level} <span className="text-black/40">({l.count})</span>
              </Link>
            ))}
          </div>
          {levels.some((l) => l.levelIsEstimated) && (
            <p className="mt-2 text-xs text-black/40">Cấp độ ước lượng bởi hệ thống, không phải phân loại chính thức.</p>
          )}
        </section>
      )}

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
                <Ipa value={e.ipa} lang={e.lang} className="text-xs text-black/40" />
                {e.glossVi && <span className="truncate text-sm text-black/55">{e.glossVi}</span>}
                <LinkPending />
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
