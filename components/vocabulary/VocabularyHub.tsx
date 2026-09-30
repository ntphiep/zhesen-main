import Link from 'next/link'
import { Ipa } from '@/components/ui/Ipa'
import { BlockPage } from '@/components/theory/BlockPage'
import { ArrowRight } from '@/components/theory/Glyphs'
import s from '@/components/theory/Theory.module.css'
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
        <section className={s.sec} data-reveal="">
          <h2 className={s.h2}>Duyệt theo trình độ</h2>
          <div className="flex flex-wrap gap-2">
            {levels.map((l) => (
              <Link
                key={l.level}
                href={vocabularyLevelPath(language.code, l.level)}
                prefetch={false}
                className={s.chip}
                data-lg=""
              >
                {l.level} <small>{l.count}</small>
              </Link>
            ))}
          </div>
          {levels.some((l) => l.levelIsEstimated) && (
            <p className={s.note}>Trình độ do Zhesen ước lượng, không theo phân loại chính thức.</p>
          )}
        </section>
      )}

      {common.length > 0 && (
        <section className={s.sec} data-reveal="1">
          <h2 className={s.h2}>Từ thông dụng</h2>
          <div className={s.entries}>
            {common.map((e) => (
              // 30 links on one page saturated the prefetch queue: 14 requests were
              // still pending after 6 seconds and the page never reached network idle.
              <Link key={e.id} href={entryPath(e.id)} prefetch={false} className={s.entry}>
                <span className={s.hw} lang={e.lang}>{e.headword}</span>
                <Ipa value={e.ipa} lang={e.lang} className={s.pron} />
                {/* `truncate` alone never shrinks a flex item, so the row grew past the
                    viewport: 520px of content in 390px of screen. */}
                {e.glossVi && <span className={`${s.gloss} min-w-0 truncate`}>{e.glossVi}</span>}
                <LinkPending />
              </Link>
            ))}
          </div>
        </section>
      )}

      <Link href="/practice" className={`${s.btn} w-fit`}>
        Luyện tập từ đã lưu <ArrowRight />
      </Link>
    </BlockPage>
  )
}
