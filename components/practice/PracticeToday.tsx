import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import { failingHref, type CalendarDay, type PracticeHub } from '@/lib/practice/today'
import { subsetHref } from '@/lib/practice/subset'
import { longDate } from '@/lib/wordlist/forecast'
import { Hw } from './SessionParts'
import { ModeIcon, practiceModes } from './PracticeModes'
import p from './Practice.module.css'

/** The top of /practice: the one thing to do now with its reason, what each skill has due,
 *  the weeks studied, and the words missed most, which can be practised on their own. */
export function PracticeToday({ hub }: { hub: PracticeHub }) {
  const { plan, next, failing } = hub
  const mode = practiceModes(hub.stats.due).find((m) => m.href === next.mode)
  const failId = 'practice-failing'
  return (
    <div className={p.today} data-split={failing.length > 0 || undefined}>
      <section aria-label="Hôm nay">
        <Link href={next.href} prefetch={false} className={p.next}>
          <ModeIcon href={next.mode} />
          <span>
            <b>{mode?.label}</b>
            <small>{next.reason}</small>
          </span>
          <span className={p.start}>Bắt đầu</span>
        </Link>
        <ul className={p.skills}>
          <li>
            <span>Nhớ ra</span>
            <Link href="/practice/review" prefetch={false}>
              {plan.recallDue + plan.newCards > 0
                ? [plan.recallDue > 0 && `${plan.recallDue} từ cần ôn`, plan.newCards > 0 && `${plan.newCards} từ mới`].filter(Boolean).join(', ')
                : 'Đã ôn xong hôm nay'}
            </Link>
          </li>
          <li>
            <span>Nhận ra</span>
            <Link href={plan.recognitionDue > 0 ? subsetHref('/practice/quiz', { kind: 'due' }) : '/practice/quiz'} prefetch={false}>
              {plan.recognitionDue > 0 ? `${plan.recognitionDue} từ đến lượt kiểm tra` : 'Đã kiểm tra xong hôm nay'}
            </Link>
          </li>
        </ul>
        <PracticeCalendar days={hub.activity.calendar} />
      </section>
      {failing.length > 0 && (
        <section className={p.fail} aria-labelledby={failId}>
          <h2 className={p.group} id={failId}>Hay sai</h2>
          <ul>
            {failing.map(({ word: w, misses }) => (
              <li key={w.id}>
                <span>
                  {w.entryId
                    ? <Link href={entryPath(w.entryId)} prefetch={false}><Hw text={w.headword} lang={w.lang} /></Link>
                    : <Hw text={w.headword} lang={w.lang} />}
                  {w.meaningVi && <small>{w.meaningVi}</small>}
                </span>
                <em>sai {misses} lần</em>
              </li>
            ))}
          </ul>
          <Link href={failingHref(failing)} prefetch={false} className={p.ghost}>Luyện riêng các từ này</Link>
        </section>
      )}
    </div>
  )
}

/** Intensity from the day's answer count; a day with no answer logged but studied is 1. */
function level(d: CalendarDay): number {
  if (!d.studied) return 0
  return d.answers >= 60 ? 4 : d.answers >= 30 ? 3 : d.answers >= 10 ? 2 : 1
}

/** One cell per study day, Monday at the top, the current week last, shaded by how many
 *  answers the day logged. */
function PracticeCalendar({ days }: { days: CalendarDay[] }) {
  const id = 'practice-calendar'
  const past = days.filter((d) => !d.future)
  const answers = past.reduce((n, d) => n + d.answers, 0)
  const weeks = days.length / 7
  return (
    <section className={p.cal} aria-labelledby={id}>
      <div className={p.calHead}>
        <h3 className={p.group} id={id}>{weeks} tuần gần nhất</h3>
        <span>{answers} câu trả lời</span>
      </div>
      <div className={p.weeks} role="img" aria-label={`${weeks} tuần gần nhất: ${past.filter((d) => d.studied).length} ngày có học`}>
        {days.map((d) => (
          <i
            key={d.day}
            data-n={d.future ? undefined : level(d)}
            data-now={d.today || undefined}
            title={d.future ? undefined : `${longDate(Date.parse(`${d.day}T05:00:00Z`))}: ${d.answers} câu`}
          />
        ))}
      </div>
    </section>
  )
}
