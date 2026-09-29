'use client'
import { useId, useState } from 'react'
import Link from 'next/link'
import { entryPath } from '@/lib/dictionary/entryId'
import type { HomeView } from '@/lib/hooks/useHomeData'
import { dayIndex, dueNote, shortDate, weekday, whenLabel, type ForecastDay } from '@/lib/wordlist/forecast'
import { DueTitle, HomeBar, Hw, LookupAnswers, LookupBox, ModeGrid, NAME, Pron, RecentChips, TheoryGrid, useHomeLookup, type PickerState } from './HomeParts'
import h from './Home.module.css'

/** Cards on the desk before the rest are summed up in one. */
const CARDS = 12
/** Headwords a forecast day names before "và N từ nữa". */
const DAY_WORDS = 7

/** "Bàn học", the default: how many words the next session hands over, the lookup beside
 *  it, the session's cards, the reviews falling due this week and the newest saved words. */
export function DeskLayout({ view, failed, picker }: { view: HomeView | null; failed: boolean; picker: PickerState }) {
  const lookup = useHomeLookup()
  const trayId = useId()
  const savedId = useId()
  const again = view ? view.pending.filter((c) => c.state.reps > 0).length : 0
  const fresh = view ? view.pending.length - again : 0
  const split = [again && `${again} từ ôn lại`, fresh && `${fresh} từ mới lưu`].filter(Boolean).join(', ')

  return (
    <div>
      <HomeBar now={view?.now ?? null} picker={picker} />
      <section className={`${h.wrap} ${h.top6}`} aria-label="Hôm nay">
        <div>
          <DueTitle due={view?.due ?? null} />
          <div className={h.sub}>
            <Link className={h.btn} href="/practice/review" prefetch={false}>Ôn ngay</Link>
            {split && <span>{split}</span>}
          </div>
        </div>
        <div>
          <LookupBox lookup={lookup} placeholder="thời tiết" />
          <RecentChips max={4} />
        </div>
      </section>

      <LookupAnswers lookup={lookup} />

      <div className={`${h.wrap} ${h.desk}`}>
        <section className={h.tray} aria-labelledby={trayId}>
          <div className={h.lblRow}>
            <p className={h.lbl} id={trayId}>Các từ sẽ ra trong phiên ôn</p>
            <Link href="/wordlist" prefetch={false}>Mở sổ tay</Link>
          </div>
          {failed && <p className={h.fail}>Chưa tải được sổ tay. Tải lại trang.</p>}
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
                      <span className={h.meta}><span>{NAME[c.lang]}</span></span>
                      <Hw lang={c.lang} text={c.headword} />
                      <Pron w={c} className={h.pr} />
                      <span className={h.note} data-late={late || undefined}>{dueNote(c.state.reps, c.state.dueAt, view.now)}</span>
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

        <div className={h.side}>
          <Week forecast={view?.forecast ?? null} />
          {view && view.recent.length > 0 && (
            <section aria-labelledby={savedId}>
              <p className={h.lbl} id={savedId}>Mới lưu</p>
              <ul className={h.saved} data-rise="">
                {view.recent.slice(0, 5).map((w, i) => (
                  <li key={w.id} style={{ animationDelay: `${i * 50}ms` }}>
                    <Link href={w.entryId ? entryPath(w.entryId) : '/wordlist'} prefetch={false}>
                      <Hw lang={w.lang} text={w.headword} />
                      {w.meaningVi && <span className={h.m}>{w.meaningVi}</span>}
                    </Link>
                    <span className={h.nx}>ôn {whenLabel(Math.max(Date.parse(w.fsrsDueAt), view.now), view.now)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <ModeGrid due={view?.due ?? null} label="Luyện tập" />
      <TheoryGrid label="Lý thuyết" />
    </div>
  )
}

/** The next seven days as bars; pressing one names its words underneath. */
function Week({ forecast }: { forecast: ForecastDay[] | null }) {
  const id = useId()
  const [picked, setPicked] = useState(1)
  const max = forecast ? Math.max(1, ...forecast.map((d) => d.count)) : 1
  const day = forecast?.[picked]
  const when = picked === 0 ? 'Hôm nay' : picked === 1 ? 'Ngày mai' : day ? `${weekday(day.ts)} ${shortDate(day.ts)}` : ''
  return (
    <section aria-labelledby={id}>
      <p className={h.lbl} id={id}>7 ngày tới</p>
      <div className={h.bars} role="group" aria-label="Số từ đến hạn mỗi ngày" data-grow="">
        {forecast?.map((d, i) => (
          <button
            key={d.ts}
            type="button"
            className={h.day}
            data-now={i === 0 || undefined}
            aria-pressed={i === picked}
            aria-label={`${i === 0 ? 'Hôm nay' : `${weekday(d.ts)} ${shortDate(d.ts)}`}: ${d.count} từ`}
            onClick={() => setPicked(i)}
          >
            <span className={h.n}>{d.count}</span>
            <span className={h.col} style={{ height: `${(d.count / max * 100).toFixed(1)}%`, animationDelay: `${i * 45}ms` }} />
            <span className={h.d}>{i === 0 ? 'Hôm nay' : weekday(d.ts, true)}</span>
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
