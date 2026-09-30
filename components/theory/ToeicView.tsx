import Link from 'next/link'
import { entryPath, buildEntryId } from '@/lib/dictionary/entryId'
import { buildGrammarPointId, grammarPointPath } from '@/lib/grammar/path'
import { BlockPage } from './BlockPage'
import { ToeicPractice } from './ToeicPractice'
import { ArrowRight, Warn } from './Glyphs'
import s from './Theory.module.css'
import type { ToeicGuide, ToeicNote, ToeicPart, ToeicSection, ToeicTip } from '@/lib/theory/types'
import type { Language } from '@/lib/languages'

const SECTIONS: { key: ToeicSection; name: string; titleVi: string }[] = [
  { key: 'listening', name: 'Listening', titleVi: 'Listening, khoảng 45 phút' },
  { key: 'reading', name: 'Reading', titleVi: 'Reading, 75 phút' },
]

/** `/theory/[lang]/toeic`: the test in the order a learner needs it. What the test looks
 *  like and how it scores, each part with its tips and traps, the grammar and words it
 *  keeps testing, one Part 5 set, then the plan and the day itself. */
export function ToeicView({ language, guide }: { language: Language; guide: ToeicGuide }) {
  const nav = [
    { id: 'format', titleVi: 'Cấu trúc đề' },
    { id: guide.scoring.id, titleVi: 'Điểm' },
    ...SECTIONS.map((sec) => ({ id: sec.key, titleVi: sec.name })),
    { id: 'grammar', titleVi: 'Ngữ pháp' },
    { id: 'paraphrase', titleVi: 'Paraphrase' },
    { id: 'words', titleVi: 'Từ vựng' },
    { id: 'practice', titleVi: 'Luyện Part 5' },
    ...guide.notes.map((n) => ({ id: n.id, titleVi: n.titleVi })),
    { id: 'links', titleVi: 'Tài liệu' },
  ]

  return (
    <BlockPage
      language={language}
      block="toeic"
      titleVi="Luyện thi TOEIC"
      leadVi="Cấu trúc đề, thang điểm và quy định phòng thi theo tài liệu của ETS, đơn vị ra đề. Mẹo, bẫy và lộ trình là kinh nghiệm ôn thi."
      toc={
        <nav aria-label="Mục" className={s.toc}>
          {nav.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={s.chip}>{n.titleVi}</a>
          ))}
        </nav>
      }
    >
      <section id="format" className={s.sec} data-reveal="">
        <h2 className={s.h2}>Cấu trúc đề</h2>
        <p className={s.prose}>
          Đề Listening và Reading có 200 câu trắc nghiệm trong khoảng 2 tiếng. Phần nghe chỉ đọc một lần.
        </p>
        <div className={s.sheet} data-fold="">
          <table>
            <thead>
              <tr>
                <th>Part</th>
                <th>Dạng</th>
                <th className={s.num}>Số câu</th>
              </tr>
            </thead>
            {SECTIONS.map((sec) => (
              <tbody key={sec.key}>
                <tr>
                  <th colSpan={3} scope="rowgroup" className={s.group}>{sec.titleVi}</th>
                </tr>
                {guide.parts.filter((p) => p.section === sec.key).map((p) => (
                  <tr key={p.number}>
                    <th scope="row">
                      <a href={`#part-${p.number}`}>Part {p.number}</a>
                    </th>
                    <td>
                      {p.titleVi} <span className={s.en} lang="en">{p.nameEn}</span>
                    </td>
                    <td className={s.num}>{p.questions}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <section id={guide.scoring.id} className={s.sec}>
        <NoteBody note={guide.scoring} />
        <div className={s.sheet}>
          <table>
            <caption>Điểm tối thiểu của từng trình độ CEFR theo ETS</caption>
            <thead>
              <tr>
                <th>Trình độ</th>
                <th className={s.num}>Listening</th>
                <th className={s.num}>Reading</th>
              </tr>
            </thead>
            <tbody>
              {guide.cefr.map((r) => (
                <tr key={r.level}>
                  <th scope="row"><span className={s.tag}>{r.level}</span></th>
                  <td className={s.num}>{r.listening}</td>
                  <td className={s.num}>{r.reading}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {SECTIONS.map((sec) => (
        <section key={sec.key} id={sec.key} className={s.sec} data-loose="">
          <h2 className={s.h2}>{sec.titleVi}</h2>
          {guide.parts.filter((p) => p.section === sec.key).map((p) => <PartCard key={p.number} part={p} />)}
        </section>
      ))}

      <section id="grammar" className={s.sec}>
        <h2 className={s.h2}>Ngữ pháp hay ra ở Part 5 và Part 6</h2>
        <p className={s.prose}>Mỗi điểm có bài đầy đủ trong khối Ngữ pháp.</p>
        <div className={s.grid}>
          {guide.grammar.map((g) => (
            <article key={g.titleVi} className={`${s.card} flex flex-col gap-3`}>
              <h3 className={s.h3}>{g.titleVi}</h3>
              {g.formula && <p className={s.formula}>{g.formula}</p>}
              <p className={s.small}>{g.explainVi}</p>
              <div className={s.example}>
                <p className={s.src} lang="en">{g.example.en}</p>
                <p className={s.vi}>{g.example.vi}</p>
              </div>
              {g.grammarKey && (
                <Link
                  href={grammarPointPath(buildGrammarPointId(language.code, g.grammarKey))}
                  prefetch={false}
                  className={`${s.more} mt-auto`}
                >
                  Xem bài ngữ pháp <ArrowRight />
                </Link>
              )}
            </article>
          ))}
        </div>
      </section>

      <section id="paraphrase" className={s.sec}>
        <h2 className={s.h2}>Paraphrase</h2>
        <p className={s.prose}>
          Đáp án đúng ở Part 3, Part 4 và Part 7 thường nói lại ý của bài bằng từ khác. Dòng trên là câu trong bài, dòng giữa là cách đáp án viết lại.
        </p>
        <ul className={`${s.grid} m-0 list-none p-0`}>
          {guide.paraphrases.map((p) => (
            <li key={p.heard} className={`${s.card} flex flex-col gap-1`}>
              <p className={`${s.src} ${s.heard}`} lang="en">{p.heard}</p>
              <p className={`${s.src} ${s.answer}`} lang="en">{p.answer}</p>
              <p className={s.vi}>{p.vi}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="words" className={s.sec}>
        <h2 className={s.h2}>Từ vựng theo chủ đề</h2>
        <p className={s.prose}>
          Nghĩa ghi theo cách dùng trong đề. Bấm một từ để nghe phát âm và lưu vào sổ tay.
        </p>
        <div className={s.grid} data-wide="">
          {guide.wordTopics.map((t) => (
            <article key={t.id} id={`words-${t.id}`} className={s.card} data-accent="">
              <h3 className={s.h3}>{t.titleVi}</h3>
              <ul className={s.lexicon}>
                {t.words.map((w) => (
                  <li key={w.word}>
                    {/* No prefetch: every word in view would fetch its entry page. */}
                    <Link href={entryPath(buildEntryId(language.code, w.word))} prefetch={false} className={s.hw} lang="en">
                      {w.word}
                    </Link>
                    <span className={s.vi}>{w.vi}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section id="practice" className={s.sec}>
        <h2 className={s.h2}>Luyện Part 5</h2>
        <p className={s.prose}>
          {guide.practice.length} câu, đúng độ dài Part 5 của đề thật. Làm trong khoảng 10 phút để quen nhịp.
        </p>
        <ToeicPractice questions={guide.practice} />
      </section>

      {guide.notes.map((n) => (
        <section key={n.id} id={n.id} className={s.sec}>
          <NoteBody note={n} />
        </section>
      ))}

      <section id="links" className={s.sec}>
        <h2 className={s.h2}>Tài liệu chính thức</h2>
        <ul className={`${s.grid} m-0 list-none p-0`}>
          {guide.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className={`${s.card} flex h-full flex-col gap-1`}>
                <span className={s.h3}>{l.titleVi} <span aria-hidden="true">↗</span></span>
                <span className={s.note}>{l.noteVi}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </BlockPage>
  )
}

function NoteBody({ note }: { note: ToeicNote }) {
  return (
    <>
      <h2 className={s.h2}>{note.titleVi}</h2>
      <p className={s.prose}>{note.introVi}</p>
      <ul className={s.bullets}>
        {note.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </>
  )
}

function PartCard({ part: p }: { part: ToeicPart }) {
  return (
    <article id={`part-${p.number}`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className={s.h3} data-lg="">Part {p.number}. {p.titleVi}</h3>
          <span className={s.note}><span lang="en">{p.nameEn}</span>, {p.questions} câu</span>
        </div>
        <p className={s.prose}>{p.formatVi}</p>
      </div>
      <TipList tips={p.tips} />
      <section className={s.callout}>
        <h4 className={s.label}><Warn />Bẫy hay gặp</h4>
        <ul>
          {p.traps.map((t) => (
            <li key={t.titleVi}>
              <p className="m-0 font-bold">{t.titleVi}</p>
              <p className={s.small}>{t.bodyVi}</p>
              {t.example && (
                <div className={`${s.example} mt-2`}>
                  <p className={s.src} lang="en">{t.example.en}</p>
                  <p className={s.vi}>{t.example.vi}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}

function TipList({ tips }: { tips: readonly ToeicTip[] }) {
  return (
    <ul className={`${s.grid} m-0 list-none p-0`}>
      {tips.map((t) => (
        <li key={t.titleVi} className={`${s.card} flex flex-col gap-2`}>
          <p className={s.h3} data-sm="">{t.titleVi}</p>
          <p className={s.small}>{t.bodyVi}</p>
          {t.example && (
            <div className={s.example}>
              <p className={s.src} lang="en">{t.example.en}</p>
              <p className={s.vi}>{t.example.vi}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
