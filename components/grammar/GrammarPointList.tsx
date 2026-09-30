import Link from 'next/link'
import { grammarPointPath } from '@/lib/grammar/path'
import { theoryLangPath } from '@/lib/theory/path'
import { NextBlock } from '@/components/theory/NextBlock'
import { PageHead } from '@/components/theory/BlockPage'
import s from '@/components/theory/Theory.module.css'
import type { GrammarLevelGroup } from '@/lib/grammar/group'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]/grammar`: grammar points grouped by level, then by category_vi. */
export function GrammarPointList({ language, levels }: { language: Language; levels: GrammarLevelGroup[] }) {
  return (
    <main className={`${s.page} font-ui`} data-l={language.code}>
      <PageHead
        language={language}
        back={{ href: theoryLangPath(language.code), label: `Lý thuyết ${language.name}` }}
        title={`Ngữ pháp ${language.name}`}
      >
        {levels.length > 1 && (
          <nav aria-label="Trình độ" className="mt-5 flex flex-wrap gap-2">
            {levels.map((lvl) => (
              <a key={lvl.level} href={`#${encodeURIComponent(lvl.level)}`} className={s.chip}>{lvl.level}</a>
            ))}
          </nav>
        )}
      </PageHead>

      <div className={`${s.body} mx-auto max-w-page px-6`}>
        {levels.length === 0 && <p className={s.note}>Chưa có điểm ngữ pháp nào.</p>}

        <div className={s.flow}>
          {levels.map((lvl, i) => (
            <section key={lvl.level} id={lvl.level} className={s.sec} data-loose="" data-reveal={i === 0 ? '' : undefined}>
              <h2 className={s.level}>{lvl.level}</h2>
              {lvl.categories.map((cat) => (
                <div key={cat.categoryVi} className="flex flex-col gap-3">
                  <h3 className={s.label}>{cat.categoryVi}</h3>
                  <div className={s.grid}>
                    {cat.points.map((p) => (
                      <Link key={p.id} href={grammarPointPath(p.id)} className={`${s.card} flex min-w-0 flex-col gap-1.5`} data-accent="">
                        <span className={s.h3}>{p.titleVi}</span>
                        <span className={`${s.pattern} truncate`}>{p.pattern}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>

        <NextBlock lang={language.code} block="grammar" />
      </div>
    </main>
  )
}
