import { theoryBlockPath, toeicPartPath } from '@/lib/theory/path'
import { PageHead } from './BlockPage'
import { ToeicPractice } from './ToeicPractice'
import { GrammarGrid, NextPage, ParaphraseList, PartBody } from './ToeicParts'
import s from './Theory.module.css'
import type { ToeicGuide, ToeicPart } from '@/lib/theory/types'
import type { Language } from '@/lib/languages'

/** `/theory/[lang]/toeic/part/[part]`: what one part looks like, its tips and traps, the
 *  blocks of the guide that serve it, its practice set where there is one, then the next part. */
export function ToeicPartView({ language, guide, part: p }: { language: Language; guide: ToeicGuide; part: ToeicPart }) {
  const next = guide.parts.find((x) => x.number === p.number + 1)
  return (
    <main className={`${s.page} font-ui`} data-l={language.code}>
      <PageHead
        language={language}
        back={{ href: theoryBlockPath(language.code, 'toeic'), label: 'Luyện thi TOEIC' }}
        title={`Part ${p.number}. ${p.titleVi}`}
        lede={p.formatVi}
      >
        <p className={s.note} data-gap=""><span lang="en">{p.nameEn}</span>, {p.questions} câu</p>
      </PageHead>

      <div className={`${s.body} mx-auto max-w-page px-6`}>
        <div className={s.flow}>
          <section className={s.sec} data-reveal="">
            <PartBody part={p} trapHeading="h2" />
          </section>

          {p.extras.includes('grammar') && (
            <section className={s.sec}>
              <h2 className={s.h2}>Ngữ pháp hay ra</h2>
              <p className={s.prose}>Mỗi điểm có bài đầy đủ trong khối Ngữ pháp.</p>
              <GrammarGrid lang={language.code} grammar={guide.grammar} />
            </section>
          )}

          {p.extras.includes('paraphrase') && (
            <section className={s.sec}>
              <h2 className={s.h2}>Paraphrase</h2>
              <p className={s.prose}>
                Đáp án đúng thường nói lại ý của bài bằng từ khác. Dòng trên là câu trong bài, dòng giữa là cách đáp án viết lại.
              </p>
              <ParaphraseList paraphrases={guide.paraphrases} />
            </section>
          )}

          {p.extras.includes('practice') && (
            <section className={s.sec}>
              <h2 className={s.h2}>Luyện Part {p.number}</h2>
              <p className={s.prose}>
                {guide.practice.length} câu, đúng độ dài Part {p.number} của đề thật. Làm trong khoảng 10 phút để quen nhịp.
              </p>
              <ToeicPractice questions={guide.practice} />
            </section>
          )}
        </div>

        {next && <NextPage href={toeicPartPath(language.code, next.number)} title={`Part ${next.number}. ${next.titleVi}`} />}
      </div>
    </main>
  )
}
