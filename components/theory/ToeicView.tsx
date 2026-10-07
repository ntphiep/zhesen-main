import Link from 'next/link'
import { entryPath, buildEntryId } from '@/lib/dictionary/entryId'
import { toeicGroupPath, toeicPartPath, toeicTopicPath } from '@/lib/theory/path'
import { TOEIC_GROUP_SIZE } from '@/lib/theory/content'
import { BlockPage } from './BlockPage'
import { ToeicPractice } from './ToeicPractice'
import { GrammarGrid, ParaphraseList, PartBody } from './ToeicParts'
import { ArrowRight } from './Glyphs'
import s from './Theory.module.css'
import type { ToeicGuide, ToeicNote, ToeicPart, ToeicSection } from '@/lib/theory/types'
import type { Language, LangCode } from '@/lib/languages'

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
        <div className={s.sheet}>
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
                      <Link href={toeicPartPath(language.code, p.number)}>Part {p.number}</Link>
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
          {guide.parts.filter((p) => p.section === sec.key).map((p) => <PartCard key={p.number} lang={language.code} part={p} />)}
        </section>
      ))}

      <section id="grammar" className={s.sec}>
        <h2 className={s.h2}>Ngữ pháp hay ra ở Part 5 và Part 6</h2>
        <p className={s.prose}>Mỗi điểm có bài đầy đủ trong khối Ngữ pháp.</p>
        <GrammarGrid lang={language.code} grammar={guide.grammar} />
      </section>

      <section id="paraphrase" className={s.sec}>
        <h2 className={s.h2}>Paraphrase</h2>
        <p className={s.prose}>
          Đáp án đúng ở Part 3, Part 4 và Part 7 thường nói lại ý của bài bằng từ khác. Dòng trên là câu trong bài, dòng giữa là cách đáp án viết lại.
        </p>
        <ParaphraseList paraphrases={guide.paraphrases} />
      </section>

      <section id="words" className={s.sec}>
        <h2 className={s.h2}>Từ vựng theo chủ đề</h2>
        <p className={s.prose}>
          Nghĩa ghi theo cách dùng trong đề. Bấm một từ để nghe phát âm và lưu vào sổ tay.
        </p>
        <div className={s.grid} data-wide="">
          {guide.wordTopics.map((t) => (
            <article key={t.id} id={`words-${t.id}`} className={s.card} data-accent="">
              <h3 className={s.h3}>
                <Link href={toeicTopicPath(language.code, t.id)} prefetch={false} className={s.go}>
                  {t.titleVi} <ArrowRight />
                </Link>
              </h3>
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
        <h3 className={s.h3} id="words-list">{guide.wordList.length.toLocaleString('vi-VN')} từ hay gặp nhất trong đề</h3>
        <p className={s.prose}>
          Xếp theo tần suất, mỗi trang {TOEIC_GROUP_SIZE} từ với nghĩa, phát âm, câu ví dụ và định nghĩa tiếng Anh.
        </p>
        <nav aria-label="Danh sách từ TOEIC" className={s.index}>
          {Array.from({ length: Math.ceil(guide.wordList.length / TOEIC_GROUP_SIZE) }, (_, i) => (
            <Link key={i} href={toeicGroupPath(language.code, i + 1)} prefetch={false} className={s.chip}>
              {(i * TOEIC_GROUP_SIZE + 1).toLocaleString('vi-VN')}{' '}
              <small>đến {Math.min((i + 1) * TOEIC_GROUP_SIZE, guide.wordList.length).toLocaleString('vi-VN')}</small>
            </Link>
          ))}
        </nav>
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

function PartCard({ lang, part: p }: { lang: LangCode; part: ToeicPart }) {
  return (
    <article id={`part-${p.number}`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className={s.h3} data-lg="">
            <Link href={toeicPartPath(lang, p.number)} className={s.go}>Part {p.number}. {p.titleVi} <ArrowRight /></Link>
          </h3>
          <span className={s.note}><span lang="en">{p.nameEn}</span>, {p.questions} câu</span>
        </div>
        <p className={s.prose}>{p.formatVi}</p>
      </div>
      <PartBody part={p} trapHeading="h4" />
    </article>
  )
}
