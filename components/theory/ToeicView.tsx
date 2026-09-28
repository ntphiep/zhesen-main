import Link from 'next/link'
import { entryPath, buildEntryId } from '@/lib/dictionary/entryId'
import { buildGrammarPointId, grammarPointPath } from '@/lib/grammar/path'
import { BlockPage } from './BlockPage'
import { ToeicPractice } from './ToeicPractice'
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
    ...SECTIONS.map((s) => ({ id: s.key, titleVi: s.name })),
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
    >
      <nav aria-label="Mục" className="mt-6 flex flex-wrap gap-2">
        {nav.map((n) => (
          <a key={n.id} href={`#${n.id}`} className="rounded-lg border border-black/10 px-3 py-1.5 text-sm hover:bg-black/5">
            {n.titleVi}
          </a>
        ))}
      </nav>

      <div className="mt-10 flex flex-col gap-14">
        <section id="format" className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Cấu trúc đề</h2>
            <p className="mt-1 text-black/70">
              Đề Listening và Reading có 200 câu trắc nghiệm trong khoảng 2 tiếng. Phần nghe chỉ đọc một lần.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-black/55">
                <tr className="border-b border-black/10">
                  <th className="py-2 pr-3 font-medium">Part</th>
                  <th className="py-2 pr-3 font-medium">Dạng</th>
                  <th className="py-2 text-right font-medium">Số câu</th>
                </tr>
              </thead>
              {SECTIONS.map((s) => (
                <tbody key={s.key}>
                  <tr>
                    <th colSpan={3} scope="rowgroup" className="pb-1 pt-4 font-semibold">{s.titleVi}</th>
                  </tr>
                  {guide.parts.filter((p) => p.section === s.key).map((p) => (
                    <tr key={p.number} className="border-b border-black/5">
                      <th scope="row" className="py-2 pr-3 align-top font-normal">
                        <a href={`#part-${p.number}`} className="font-medium hover:underline">Part {p.number}</a>
                      </th>
                      <td className="py-2 pr-3 align-top">
                        {p.titleVi} <span className="text-black/55">{p.nameEn}</span>
                      </td>
                      <td className="py-2 text-right align-top tabular-nums">{p.questions}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </section>

        <section id={guide.scoring.id} className="flex flex-col gap-4">
          <NoteBody note={guide.scoring} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="pb-2 text-left text-black/60">Điểm tối thiểu của từng trình độ CEFR theo ETS</caption>
              <thead className="text-black/55">
                <tr className="border-b border-black/10">
                  <th className="py-2 pr-3 font-medium">Trình độ</th>
                  <th className="py-2 pr-3 text-right font-medium">Listening</th>
                  <th className="py-2 text-right font-medium">Reading</th>
                </tr>
              </thead>
              <tbody>
                {guide.cefr.map((r) => (
                  <tr key={r.level} className="border-b border-black/5">
                    <th scope="row" className="py-2 pr-3 font-medium">{r.level}</th>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.listening}</td>
                    <td className="py-2 text-right tabular-nums">{r.reading}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {SECTIONS.map((s) => (
          <section key={s.key} id={s.key} className="flex flex-col gap-10">
            <h2 className="text-2xl font-semibold">{s.titleVi}</h2>
            {guide.parts.filter((p) => p.section === s.key).map((p) => <PartCard key={p.number} part={p} />)}
          </section>
        ))}

        <section id="grammar" className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Ngữ pháp hay ra ở Part 5 và Part 6</h2>
            <p className="mt-1 text-black/70">Mỗi điểm có bài đầy đủ trong khối Ngữ pháp.</p>
          </div>
          {guide.grammar.map((g) => (
            <article key={g.titleVi} className="rounded-2xl border border-black/10 px-5 py-4">
              <h3 className="font-semibold">{g.titleVi}</h3>
              {g.formula && <p className="mt-1 font-mono text-sm text-black/60">{g.formula}</p>}
              <p className="mt-2 text-black/80">{g.explainVi}</p>
              <div className="mt-3 border-l-2 border-black/10 pl-3">
                <p className="text-black/85">{g.example.en}</p>
                <p className="text-sm text-black/55">{g.example.vi}</p>
              </div>
              {g.grammarKey && (
                <Link
                  href={grammarPointPath(buildGrammarPointId(language.code, g.grammarKey))}
                  prefetch={false}
                  className="mt-3 inline-block text-sm text-black/55 hover:underline"
                >
                  Xem bài ngữ pháp
                </Link>
              )}
            </article>
          ))}
        </section>

        <section id="paraphrase" className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Paraphrase</h2>
            <p className="mt-1 text-black/70">
              Đáp án đúng ở Part 3, Part 4 và Part 7 thường nói lại ý của bài bằng từ khác. Dòng trên là câu trong bài, dòng giữa là cách đáp án viết lại.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {guide.paraphrases.map((p) => (
              <li key={p.heard} className="rounded-xl border border-black/10 px-4 py-3 text-sm">
                <p className="text-black/85">{p.heard}</p>
                <p className="font-medium text-emerald-700">{p.answer}</p>
                <p className="text-black/55">{p.vi}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="words" className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Từ vựng theo chủ đề</h2>
            <p className="mt-1 text-black/70">
              Nghĩa ghi theo cách dùng trong đề. Bấm một từ để nghe phát âm và lưu vào sổ tay.
            </p>
          </div>
          {guide.wordTopics.map((t) => (
            <article key={t.id} id={`words-${t.id}`} className="rounded-2xl border border-black/10 px-5 py-4">
              <h3 className="font-semibold">{t.titleVi}</h3>
              <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                {t.words.map((w) => (
                  <li key={w.word}>
                    {/* No prefetch: every word in view would fetch its entry page. */}
                    <Link
                      href={entryPath(buildEntryId(language.code, w.word))}
                      prefetch={false}
                      className="font-medium text-black/85 hover:underline"
                    >
                      {w.word}
                    </Link>
                    <span className="text-black/55"> · {w.vi}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section id="practice" className="flex flex-col gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Luyện Part 5</h2>
            <p className="mt-1 text-black/70">
              {guide.practice.length} câu, đúng độ dài Part 5 của đề thật. Làm trong khoảng 10 phút để quen nhịp.
            </p>
          </div>
          <ToeicPractice questions={guide.practice} />
        </section>

        {guide.notes.map((n) => (
          <section key={n.id} id={n.id}>
            <NoteBody note={n} />
          </section>
        ))}

        <section id="links" className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">Tài liệu chính thức</h2>
          <ul className="flex flex-col gap-3">
            {guide.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                  {l.titleVi}
                </a>
                <p className="text-sm text-black/55">{l.noteVi}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </BlockPage>
  )
}

function NoteBody({ note }: { note: ToeicNote }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold">{note.titleVi}</h2>
      <p className="mt-1 text-black/70">{note.introVi}</p>
      <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-black/80">
        {note.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </div>
  )
}

function PartCard({ part: p }: { part: ToeicPart }) {
  return (
    <article id={`part-${p.number}`} className="flex flex-col gap-4">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 className="text-xl font-semibold">Part {p.number}. {p.titleVi}</h3>
          <span className="text-sm text-black/55">{p.nameEn}, {p.questions} câu</span>
        </div>
        <p className="mt-1 text-black/75">{p.formatVi}</p>
      </div>
      <TipList tips={p.tips} />
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-700">Bẫy hay gặp</h4>
        <ul className="mt-2 flex flex-col gap-3">
          {p.traps.map((t) => (
            <li key={t.titleVi}>
              <p className="font-medium text-amber-900">{t.titleVi}</p>
              <p className="mt-0.5 text-sm text-amber-900/80">{t.bodyVi}</p>
              {t.example && (
                <p className="mt-1 text-sm text-amber-900/70">
                  <span className="italic">{t.example.en}</span> {t.example.vi}
                </p>
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
    <ul className="flex flex-col gap-3">
      {tips.map((t) => (
        <li key={t.titleVi} className="rounded-2xl border border-black/10 px-5 py-4">
          <p className="font-medium">{t.titleVi}</p>
          <p className="mt-1 text-sm text-black/75">{t.bodyVi}</p>
          {t.example && (
            <div className="mt-2 border-l-2 border-black/10 pl-3 text-sm">
              <p className="text-black/85">{t.example.en}</p>
              <p className="text-black/55">{t.example.vi}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
