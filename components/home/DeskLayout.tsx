'use client'
import { useId, useState } from 'react'
import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import type { HomeView } from '@/lib/hooks/useHomeData'
import { dayIndex, dueNote, shortDate, weekday, type ForecastDay } from '@/lib/wordlist/forecast'
import { DayStats, DueTitle, HomeBar, Hw, LookupAnswers, LookupBox, ModeLinks, NAME, Pron, RecentChips, useHomeLookup, type PickerState } from './HomeParts'
import h from './Home.module.css'

/** Cards on the desk before the rest are summed up in one. */
const CARDS = 12
/** Headwords a forecast day names before "và N từ nữa". */
const DAY_WORDS = 7

/** "Bàn học", the default: how many words the next session hands over and the button that
 *  starts it, the lookup beside it, the session's cards, then the streak, the goal and the
 *  reviews falling due in the days after today. */
export function DeskLayout({ view, failed, onRetry, picker }: { view: HomeView | null; failed: boolean; onRetry: () => void; picker: PickerState }) {
  const lookup = useHomeLookup()
  const trayId = useId()

  return (
    <div>
      <HomeBar now={view?.now ?? null} picker={picker} />
      <section className={`${h.wrap} ${h.top6}`} aria-label="Hôm nay">
        <div>
          <DueTitle due={view?.due ?? null} failed={failed} onRetry={onRetry} />
          <div className={h.sub}>
            <Link className={h.btn} href="/practice/review" prefetch={false}>Ôn ngay</Link>
          </div>
          <ModeLinks />
        </div>
        <div>
          <LookupBox lookup={lookup} placeholder="thời tiết" />
          <RecentChips max={4} />
        </div>
      </section>

      <LookupAnswers lookup={lookup} />

      <div className={`${h.wrap} ${h.desk}`}>
        <section className={h.tray} aria-labelledby={trayId}>
          <p className={h.lbl} id={trayId}>Phiên ôn hôm nay</p>
          {view && (view.pending.length ? (
            <ol className={h.cards} data-deal="">
              {view.pending.slice(0, CARDS).map((c, i) => {
                const late = c.state.reps > 0 && dayIndex(view.now) > dayIndex(c.state.dueAt)
                return (
                  <li key={c.id}>
                    <Link
                      className={h.card}
                      data-l={c.lang}
                      href={c.entryId ? entryPath(c.entryId) : '/wordlist'}
                      prefetch={false}
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <span className={h.sr}>{NAME[c.lang]}: </span>
                      <Hw lang={c.lang} text={c.headword} />
                      <Pron w={c} className={h.pr} />
                      {c.state.reps > 0 && <span className={h.note} data-late={late || undefined}>{dueNote(c.state.reps, c.state.dueAt, view.now)}</span>}
                    </Link>
                  </li>
                )
              })}
              {view.pending.length > CARDS && (
                <li>
                  <Link className={`${h.card} ${h.more}`} href="/practice/review" prefetch={false} style={{ animationDelay: `${CARDS * 40}ms` }}>
                    Và {view.pending.length - CARDS} từ nữa
                  </Link>
                </li>
              )}
            </ol>
          ) : (
            <p className={h.empty}>{view.total ? 'Chưa có từ đến hạn ôn hôm nay.' : 'Chưa có từ. Tra một từ để lưu.'}</p>
          ))}
        </section>

        {/* After the cards, which fill the tray above it on a phone. */}
        {view && (
          <div className={h.side}>
            <DayStats view={view} />
            <Week forecast={view.forecast.slice(1)} />
          </div>
        )}
      </div>
    </div>
  )
}

/** The days after today as bars; pressing one names its words underneath. Today's count is
 *  the title's. */
function Week({ forecast }: { forecast: ForecastDay[] | null }) {
  const id = useId()
  const [picked, setPicked] = useState(0)
  const max = forecast ? Math.max(1, ...forecast.map((d) => d.count)) : 1
  const day = forecast?.[picked]
  const when = picked === 0 ? 'Ngày mai' : day ? `${weekday(day.ts)} ${shortDate(day.ts)}` : ''
  return (
    <section aria-labelledby={id}>
      <p className={h.lbl} id={id}>Những ngày tới</p>
      <div className={h.bars} role="group" aria-label="Số từ đến hạn mỗi ngày" data-grow="">
        {forecast?.map((d, i) => (
          <button
            key={d.ts}
            type="button"
            className={h.day}
            aria-pressed={i === picked}
            aria-label={`${i === 0 ? 'Ngày mai' : `${weekday(d.ts)} ${shortDate(d.ts)}`}: ${d.count} từ`}
            onClick={() => setPicked(i)}
          >
            <span className={h.n}>{d.count}</span>
            <span className={h.col} style={{ height: `${(d.count / max * 100).toFixed(1)}%`, animationDelay: `${i * 45}ms` }} />
            <span className={h.d}>{weekday(d.ts, true)}</span>
          </button>
        ))}
      </div>
      <p className={h.dayWords} aria-live="polite">
        {day && (day.count ? (
          <>
            {when}:{' '}
            {day.words.slice(0, DAY_WORDS).map((w, i) => (
              <span key={w.id}>{i > 0 && ', '}<Hw lang={w.lang} text={w.headword} /></span>
            ))}
            {day.count > DAY_WORDS && ` và ${day.count - DAY_WORDS} từ nữa`}.
          </>
        ) : `${when}: chưa có từ đến hạn.`)}
      </p>
    </section>
  )
}
