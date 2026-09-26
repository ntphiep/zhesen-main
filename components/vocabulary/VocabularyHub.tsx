import Link from 'next/link'
import { Ipa } from '@/components/ui/Ipa'
import { BlockPage } from '@/components/theory/BlockPage'
import { entryPath } from '@/lib/dictionary/entryId'
import { vocabularyLevelPath } from '@/lib/theory/path'
import { LinkPending } from '@/components/ui/LinkPending'
import type { Language } from '@/lib/languages'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { LevelSummary } from '@/lib/dictionary/levels'

/** `/theory/[lang]/vocabulary`: the words themselves, by level, plus the ones worth
 *  knowing first. The lookup box and the grammar button that stood here belong to the
 *  header and to the hub above this page. */
export function VocabularyHub({ language, common, levels }: {
  language: Language
  common: DictEntryPreview[]
  levels: LevelSummary[]
}) {
  return (
    <BlockPage
      language={language}
      block="vocabulary"
      titleVi={`Từ vựng ${language.name}`}
      leadVi="Chọn một trình độ để xem danh sách từ hoặc lưu cả danh sách vào sổ tay."
    >
      {levels.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/40">Duyệt theo trình độ</h2>
          <div className="flex flex-wrap gap-2">
            {levels.map((l) => (
              <Link
                key={l.level}
                href={vocabularyLevelPath(language.code, l.level)}
                prefetch={false}
                className="rounded-full border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5"
              >
                {l.level} <span className="text-black/40">({l.count})</span>
              </Link>
            ))}
          </div>
          {levels.some((l) => l.levelIsEstimated) && (
            <p className="mt-2 text-xs text-black/40">Trình độ do Zhesen ước lượng, không theo phân loại chính thức.</p>
          )}
        </section>
      )}

      {common.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-black/40">Từ thông dụng</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {common.map((e) => (
              // 30 links on one page saturated the prefetch queue: 14 requests were
              // still pending after 6 seconds and the page never reached network idle.
              <Link
                key={e.id}
                href={entryPath(e.id)}
                prefetch={false}
                className="flex min-w-0 items-baseline gap-2 rounded-lg border border-black/10 px-4 py-2 hover:bg-black/5"
              >
                <span className="font-medium">{e.headword}</span>
                <Ipa value={e.ipa} lang={e.lang} className="text-xs text-black/40" />
                {/* `truncate` alone never shrinks a flex item, so the row grew past the
                    viewport: 520px of content in 390px of screen. */}
                {e.glossVi && <span className="min-w-0 truncate text-sm text-black/55">{e.glossVi}</span>}
                <LinkPending />
              </Link>
            ))}
          </div>
        </section>
      )}

      <Link
        href="/practice"
        className="mt-8 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
      >
        Luyện tập từ đã lưu →
      </Link>
    </BlockPage>
  )
}
