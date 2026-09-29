'use client'
import { useId } from 'react'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { AudioButton } from '@/components/ui/AudioButton'
import { entryPath } from '@/lib/dictionary/entryId'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { HomeView } from '@/lib/hooks/useHomeData'
import { useNarrowViewport } from '@/lib/hooks/useNarrowViewport'
import type { LangCode } from '@/lib/languages'
import type { SrsState } from '@/lib/progress/types'
import { localDay } from '@/lib/wordlist/activity'
import { dayIndex, longDate, mondayIndex } from '@/lib/wordlist/forecast'
import { CountUp, DueTitle, HomeBar, Hw, LookupAnswers, LookupBox, ModeGrid, NAME, ORDER, Pron, useHomeLookup, type PickerState } from './HomeParts'
import { HomeReviewDeck } from './HomeReviewDeck'
import h from './Home.module.css'

const DAY = 86_400_000

/** Today's word and its equivalents in the other two languages, read on the server. */
export type DailyTrio = Record<LangCode, DictEntryPreview | null>

/** "Ôn ngay": the session starts on the page. Beside the lookup box and today's word, the
 *  first due word is already on screen; below, the days studied, the streak and the words
 *  forgotten most often. */
export function TodayLayout({ view, failed, onRetry, picker, daily, supabase, onGraded }: {
  view: HomeView | null
  failed: boolean
  onRetry: () => void
  picker: PickerState
  daily: DailyTrio | null
  supabase: SupabaseClient | null
  onGraded: (id: string, next: SrsState, back: boolean) => void
}) {
  const lookup = useHomeLookup()
  const wodId = useId()
  const leechId = useId()

  return (
    <div>
      <HomeBar now={view?.now ?? null} picker={picker} />
      <div className={`${h.wrap} ${h.log8}`}>
        <section aria-label="Tra từ">
          <DueTitle due={view?.due ?? null} failed={failed} onRetry={onRetry} />
          <LookupBox lookup={lookup} placeholder="giấc mơ" />
          {daily && (
            <div className={h.wod} role="group" aria-labelledby={wodId}>
              <p className={h.lbl} id={wodId}>Từ vựng hôm nay</p>
              <div className={h.three}>
                {ORDER.map((lang) => {
                  const e = daily[lang]
                  if (!e) return null
                  return (
                    <div key={lang} className={h.w3} data-l={lang}>
                      <div className={h.tp}><span>{NAME[lang]}</span><span>{e.level}</span></div>
                      <Link className={h.hw} data-l={lang} lang={lang} href={entryPath(e.id)} prefetch={false}>{e.headword}</Link>
                      <Pron w={e} className={h.pr} />
                      <span className={h.gl}>{e.glossVi}</span>
                      <div className={h.acts}>
                        <AudioButton text={e.headword} lang={lang} audioUrl={e.audioUrl} label="Nghe" tone="pane" />
                        <AddToWordlistButton entry={e} tone="pane" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
        {view && supabase ? (
          <HomeReviewDeck cards={view.pending} supabase={supabase} now={view.now} total={view.total} onGraded={onGraded} />
        ) : (
          <section className={h.deck} aria-label="Phiên ôn hôm nay">
            <div className={h.lblRow}><p className={h.lbl}>Phiên ôn hôm nay</p></div>
            <div className={h.slot}>
              <div className={`${h.rc} ${h.done}`}>
                <p className={h.empty}>&nbsp;</p>
              </div>
            </div>
          </section>
        )}
      </div>

      <LookupAnswers lookup={lookup} />

      <div className={`${h.wrap} ${h.diary}`}>
        <Calendar view={view} />
        <section aria-labelledby={leechId}>
          <div className={h.lblRow}>
            <p className={h.lbl} id={leechId}>Hay sai</p>
            <Link href="/wordlist" prefetch={false}>Mở sổ tay</Link>
          </div>
          {view && (view.leeches.length ? (
            <ul className={h.leech}>
              {view.leeches.slice(0, 5).map((w) => (
                <li key={w.id}>
                  <Link href={w.entryId ? entryPath(w.entryId) : '/wordlist'} prefetch={false}>
                    <Hw lang={w.lang} text={w.headword} />
                    {w.meaningVi && <span className={h.m}>{w.meaningVi}</span>}
                  </Link>
                  <span className={h.n}>sai {w.fsrsLapses} lần</span>
                </li>
              ))}
            </ul>
          ) : <p className={h.empty}>Chưa có từ hay sai.</p>)}
        </section>
      </div>

      <ModeGrid due={view?.due ?? null} from={1} label="Luyện cách khác" />
    </div>
  )
}

const ROW_LABEL = ['T2', '', 'T4', '', 'T6', '', 'CN']

/** One cell per day, Monday at the top: studied or not, since `review_log` holds one row
 *  per day and no count. A phone gets 17 weeks, anything wider 26. */
function Calendar({ view }: { view: HomeView | null }) {
  const id = useId()
  const narrow = useNarrowViewport()
  const n = narrow ? 17 : 26
  const cells: React.ReactNode[] = []
  let studied = 0
  if (view) {
    const today = dayIndex(view.now)
    const start = today - mondayIndex(view.now) - (n - 1) * 7
    let lastMonth = 0
    for (let c = 0; c < n; c++) {
      const month = Number(localDay(view.now + (start + c * 7 - today) * DAY).slice(5, 7))
      cells.push(<span key={`m${c}`} className={h.mo} style={{ gridColumn: c + 2 }}>{c > 0 && month !== lastMonth ? `Tháng ${month}` : ''}</span>)
      lastMonth = month
      for (let r = 0; r < 7; r++) {
        const d = start + c * 7 + r
        const ts = view.now + (d - today) * DAY
        const on = view.days.has(localDay(ts))
        if (on && d <= today) studied++
        cells.push(
          <i
            key={`${c}-${r}`}
            style={{ gridColumn: c + 2, gridRow: r + 2, animationDelay: d === today && view.gradedNow ? undefined : `${c * 22}ms` }}
            data-on={on || undefined}
            data-fut={d > today || undefined}
            data-now={d === today || undefined}
            data-pop={d === today && view.gradedNow > 0 ? '' : undefined}
            title={`${longDate(ts)}${on ? ', có học' : ''}`}
          />,
        )
      }
    }
    ROW_LABEL.forEach((t, r) => cells.push(<span key={`w${r}`} className={h.wl} style={{ gridRow: r + 2 }} aria-hidden="true">{t}</span>))
  }
  return (
    <section className={h.cal} aria-labelledby={id}>
      <p className={h.lbl} id={id}>Những ngày đã học</p>
      <div
        className={h.weeks}
        role="img"
        aria-label={view ? `${n} tuần gần nhất: học ${studied} ngày` : undefined}
        data-fill=""
        style={{ gridTemplateColumns: `1.7rem repeat(${n}, minmax(0, 1.35rem))` }}
      >
        {cells}
      </div>
      <p className={h.calkey}><i />Không học<i data-on="" />Có ôn ít nhất một từ</p>
      <div className={h.facts}>
        <div className={h.fact}><b><CountUp value={view?.streak ?? null} /></b><span>ngày học liền</span></div>
        <div className={h.fact}><b><CountUp value={view?.reviewedToday ?? null} ms={300} /></b><span>từ đã ôn hôm nay</span></div>
      </div>
    </section>
  )
}
