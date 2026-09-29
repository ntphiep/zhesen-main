'use client'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import Link from 'next/link'
import { useGlobe } from '@/lib/hooks/useGlobe'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import { watchScheme } from '@/lib/theme'
import { byLang } from '@/lib/languages'
import { entryPath } from '@/lib/dictionary/entryId'
import { formatPronunciation } from '@/lib/dictionary/pronunciation'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { Answers } from '@/lib/home/landing'
import type { WorldFact } from '@/lib/home/worldFacts'
import { EXAMPLE_QUERY, HINT_WORDS, TRY_WORDS } from '@/lib/home/content'
import { AddToWordlistButton } from '@/components/lookup/AddToWordlistButton'
import { AudioButton } from '@/components/ui/AudioButton'
import { HANOI, type Lang } from './globe/motion'
import { HeroScene, ORDER, seedAnswer, type Shown } from './heroScene'
import s from './Landing.module.css'

const NAME = byLang((l) => l.name)
const ALL_LIT: Record<Lang, boolean> = { en: true, zh: true, es: true }
const NONE_LIT: Record<Lang, boolean> = { en: false, zh: false, es: false }

const hasText = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().length > 1

function pronOf(e: DictEntryPreview): string | null {
  if (e.lang === 'zh') return e.reading || e.ipa
  return formatPronunciation((e.ipa ?? '').split(/ ~ | \[/)[0], e.lang)
}

/** The first screen: the lookup, the globe, and the three lanes the globe opens into on
 *  scroll. `example` is the server's answer for "hoa", drawn before any script runs. */
export function LandingWorld({ example, facts }: { example: Answers | null; facts: Record<Lang, WorldFact> }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState<Shown | null>(example && { query: EXAMPLE_QUERY, entries: example, user: false, still: true, seq: 0 })
  const [landed, setLanded] = useState(ALL_LIT)
  const [error, setError] = useState<string | null>(null)
  const [due, setDue] = useState('trước khi quên')
  const [status, setStatus] = useState('')
  const [pinned, setPinned] = useState<Lang | null>(null)
  const [hot, setHot] = useState<Lang[]>([])
  const [stopped, setStopped] = useState(false)

  const sectionRef = useRef<HTMLElement>(null)
  const stickRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const lanesRef = useRef<HTMLDivElement>(null)
  const laneHeadRef = useRef<HTMLDivElement>(null)
  const frontRef = useRef<HTMLDivElement>(null)
  const introRef = useRef<HTMLDivElement>(null)
  const globeColRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLDivElement>(null)
  const keyRef = useRef<HTMLUListElement>(null)
  const cueRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLCanvasElement>(null)
  const pinsRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sceneRef = useRef<HeroScene>(null)
  const timer = useRef(0)

  const { globe, world } = useGlobe(heroRef, {
    center: HANOI,
    spin: 5,
    onHover: (hit, x, y) => sceneRef.current?.hover(hit, x, y),
    onTap: (hit, x, y) => sceneRef.current?.tap(hit, x, y),
  })

  useEffect(() => {
    const el = {
      section: sectionRef.current, stick: stickRef.current, map: mapRef.current, lanes: lanesRef.current,
      laneHead: laneHeadRef.current, front: frontRef.current, intro: introRef.current, globeCol: globeColRef.current,
      legend: legendRef.current, key: keyRef.current, cue: cueRef.current, stage: stageRef.current,
      hero: heroRef.current, pins: pinsRef.current, tip: tipRef.current,
    }
    const { section, stick, map, lanes, laneHead, front, intro, globeCol, legend, key, cue, stage, hero, pins, tip } = el
    if (!section || !stick || !map || !lanes || !laneHead || !front || !intro || !globeCol || !legend || !key || !cue || !stage || !hero || !pins || !tip) return
    if (example) seedAnswer(EXAMPLE_QUERY, example)
    const scene = new HeroScene({ section, stick, map, lanes, laneHead, front, intro, globeCol, legend, key, cue, stage, hero, pins, tip }, {
      show: (next) => { setShown(next); setLanded(next.still ? ALL_LIT : NONE_LIT); setError(null) },
      land: (l) => setLanded((prev) => ({ ...prev, [l]: true })),
      fail: setError,
      due: setDue,
      status: setStatus,
      pinned: setPinned,
      hot: (ls) => setHot((prev) => (prev.join() === ls.join() ? prev : ls)),
    }, s.pin)
    sceneRef.current = scene
    const unwatch = watchScheme(() => scene.themeChanged())
    return () => { unwatch(); scene.destroy(); sceneRef.current = null }
  }, [example])

  useEffect(() => {
    const scene = sceneRef.current
    if (!globe || !world || !scene) return
    let live = true
    void (async () => {
      await scene.attach(globe, world)
      await Promise.all([document.fonts.ready, new Promise((ok) => setTimeout(ok, 400))])
      if (!live) return
      const input = inputRef.current
      const first = input?.value.trim() || EXAMPLE_QUERY
      if (input && !input.value) input.value = first
      void scene.run(first, false)
    })()
    return () => { live = false }
  }, [globe, world])

  useEffect(() => { sceneRef.current?.resize() }, [reduced])

  useLayoutEffect(() => {
    lanesRef.current?.querySelectorAll<HTMLElement>('[data-word]').forEach(fitWord)
    sceneRef.current?.refilled()
  }, [shown])

  function look(q: string) {
    if (inputRef.current) inputRef.current.value = q
    window.clearTimeout(timer.current)
    void sceneRef.current?.run(q, true)
  }

  function toggleMotion() {
    const scene = sceneRef.current
    if (!scene) return
    const now = scene.toggleMotion()
    setStopped(now)
    if (now && scene.touring) void scene.run(inputRef.current?.value || EXAMPLE_QUERY, false)
  }

  const firstLang = shown ? ORDER.find((l) => shown.entries[l].length) : undefined
  const firstWord = shown && firstLang ? shown.entries[firstLang][0] : null

  return (
    <section ref={sectionRef} className={s.world} data-still={reduced ? '' : undefined} aria-label="Tra từ">
      <div ref={stickRef} className={s.stick}>
        <div className={s.scene}>
          <canvas ref={mapRef} className={s.map} aria-hidden="true" />
          <div ref={lanesRef} className={s.lanes}>
            {ORDER.map((l, i) => (
              <Lane key={l} lang={l} shown={shown} fact={facts[l]} reduced={reduced} headRef={i === 0 ? laneHeadRef : undefined} onTry={look} />
            ))}
          </div>
        </div>
        <div ref={frontRef} className={s.front}>
          <div ref={introRef} className={s.intro}>
            <h1 className={s.lead}>
              <span className={s.nw}>Học tiếng Anh, tiếng Trung</span> <span className={s.nw}>và tiếng Tây Ban Nha</span>{' '}
              <span className={s.nw}>bằng tiếng Việt.</span>
            </h1>
            <p className={s.eg}>
              <span className={s.egTag} data-mine={shown?.user ? '' : undefined}>{shown?.user ? 'Kết quả' : 'Ví dụ'}</span>
              <span className={s.say}>{error ?? (shown && <SayLine shown={shown} landed={landed} />)}</span>
            </p>
            <form
              className={s.box}
              role="search"
              onSubmit={(e) => { e.preventDefault(); look(inputRef.current?.value || EXAMPLE_QUERY) }}
            >
              <label htmlFor="landing-q">Gõ một từ tiếng Việt</label>
              <input
                ref={inputRef}
                id="landing-q"
                placeholder={EXAMPLE_QUERY}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                onChange={(e) => {
                  const v = e.target.value
                  window.clearTimeout(timer.current)
                  if (hasText(v)) timer.current = window.setTimeout(() => void sceneRef.current?.run(v, true), 450)
                }}
              />
              <button type="submit">Tra</button>
            </form>
            <p className={s.hint}>
              Hoặc thử{' '}
              {HINT_WORDS.map((w, i) => (
                <span key={w}><button type="button" onClick={() => look(w)}>{w}</button>{i < HINT_WORDS.length - 1 ? ', ' : '.'}</span>
              ))}
            </p>
            <ol
              key={shown?.seq ?? 0}
              className={s.loop}
              hidden={!firstWord}
              data-fresh={shown && shown.seq > 0 && !reduced ? '' : undefined}
              aria-label="Sau khi tra"
            >
              <li><span className={s.ic} aria-hidden="true"><svg viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5" /><path d="m12.5 12.5 4 4" /></svg></span><span>Tra <b>{shown?.query ?? EXAMPLE_QUERY}</b></span></li>
              <li>
                <Link href="/register" prefetch={false}>
                  <span className={s.ic} aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M5.5 3h9v14l-4.5-3.2L5.5 17z" /></svg></span>
                  <span>Lưu <b lang={firstWord?.lang}>{firstWord?.headword}</b> vào sổ tay</span>
                </Link>
              </li>
              <li>
                <a href="#review">
                  <span className={s.ic} aria-hidden="true"><svg viewBox="0 0 20 20"><rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8.5h14M7 2.5v4M13 2.5v4" /></svg></span>
                  <span>Ôn lại <b>{due}</b></span>
                </a>
              </li>
            </ol>
          </div>
          <div ref={globeColRef} className={s.globeCol}>
            <div ref={stageRef} className={s.stage}>
              <canvas
                ref={heroRef}
                className={s.globe}
                tabIndex={0}
                aria-label="Quả địa cầu tô màu các nước nói tiếng Anh, tiếng Trung và tiếng Tây Ban Nha. Dùng phím mũi tên để xoay."
              />
              <div ref={pinsRef} className={s.pins} aria-hidden="true" />
              <div ref={tipRef} className={s.tip} aria-hidden="true" />
              <button
                type="button"
                className={s.motion}
                hidden={reduced || !globe}
                aria-pressed={stopped}
                aria-label="Dừng quả cầu"
                onClick={toggleMotion}
              >
                {stopped ? PLAY : PAUSE}
              </button>
            </div>
            <div
              ref={legendRef}
              className={s.legend}
              role="group"
              aria-label="Thứ tiếng trên quả cầu"
              onPointerLeave={() => sceneRef.current?.preview(null)}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) sceneRef.current?.preview(null) }}
            >
              {ORDER.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={pinned === l}
                  data-hot={hot.includes(l) ? '' : undefined}
                  onPointerEnter={() => sceneRef.current?.preview(l)}
                  onFocus={() => sceneRef.current?.preview(l)}
                  onClick={() => sceneRef.current?.press(l)}
                >
                  <span className={s.sw} data-l={l} />{NAME[l]}
                </button>
              ))}
            </div>
            <ul ref={keyRef} className={s.key} aria-label="Cách tô màu">
              <li title="Hơn một nửa dân số nói thứ tiếng này"><span className={s.sw} data-l="solid" />Đa số dân nói</li>
              <li title="Là ngôn ngữ chính thức, nhưng chưa tới một nửa dân số nói"><span className={s.sw} data-l="dots" />Ngôn ngữ chính thức</li>
              <li title="Dùng hai trong ba thứ tiếng"><span className={s.sw} data-l="stripes" />Dùng hai thứ tiếng</li>
              <li><span className={s.sw} data-l="vn" />Việt Nam</li>
            </ul>
          </div>
        </div>
        <div ref={cueRef} className={s.cue} aria-hidden="true"><i />Cuộn xuống</div>
      </div>
      <p className="sr-only" role="status">{status}</p>
    </section>
  )
}

const PAUSE = <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3" width="3" height="10" rx="1" /><rect x="9.5" y="3" width="3" height="10" rx="1" /></svg>
const PLAY = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" /></svg>

/** "Hoa là flower, 花 và flor." Each word waits faded until its arc lands. A comma stays
 *  glued to the word before it, so a line never starts with one. */
function SayLine({ shown, landed }: { shown: Shown; landed: Record<Lang, boolean> }) {
  const ls = ORDER.filter((l) => shown.entries[l].length)
  if (!ls.length) return <>Chưa có từ khớp. Thử một từ khác.</>
  const word = (l: Lang) => (
    <span className={s.w} data-l={l} lang={l} data-state={shown.still ? undefined : landed[l] ? 'land' : 'wait'}>
      {shown.entries[l][0].headword}
    </span>
  )
  const parts: ReactNode[] = ls.map((l, i) =>
    i < ls.length - 2 ? <span key={l} className={s.nw}>{word(l)},</span>
      : i === ls.length - 1 ? <span key={l} className={s.nw}>{word(l)}.</span>
      : <span key={l}>{word(l)}</span>)
  const vi = shown.query.charAt(0).toUpperCase() + shown.query.slice(1)
  return (
    <>
      <span>{vi}</span> là{' '}
      {parts.length > 1 ? <>{parts.slice(0, -1).map((p, i) => <span key={i}>{p}{i < parts.length - 2 ? ' ' : ''}</span>)} và {parts[parts.length - 1]}</> : parts[0]}
    </>
  )
}

/** One lane: the language's fact, then the looked-up word in it, or two words to try. */
function Lane({ lang, shown, fact, reduced, headRef, onTry }: {
  lang: Lang
  shown: Shown | null
  fact: WorldFact
  reduced: boolean
  headRef?: Ref<HTMLDivElement>
  onTry: (q: string) => void
}) {
  const list = shown?.entries[lang] ?? []
  const top = list[0]
  const pron = top ? pronOf(top) : null
  const two = shown ? TRY_WORDS.filter((w) => w !== shown.query).slice(0, 2) : []
  return (
    <div className={s.pane} data-l={lang}>
      <div ref={headRef} className={s.ph}><span>{NAME[lang]}</span>{top?.level && <span className={s.lv}>{top.level}</span>}</div>
      <div className={s.sil} aria-hidden="true" />
      <div className={s.fact}>
        <div className={s.fig}><b data-n={fact.figure}>{fact.figure}</b><span>{fact.unit}</span></div>
        <p className={s.long}>{fact.long}</p>
        <p className={s.short}>{fact.short}</p>
      </div>
      {top ? (
        <Fragment key={shown?.seq}>
          <Link
            href={entryPath(top.id)}
            prefetch={false}
            data-word=""
            lang={lang}
            aria-label={lang === 'zh' ? top.headword : undefined}
            className={`${s.word} ${reduced ? s.fade : s.rise}`}
          >
            {lang === 'zh'
              ? [...top.headword].map((c, i) => (
                <span key={i} className={s.cell} data-c={c} aria-hidden="true"><span className={s.g}>{c}</span><span className={s.hz} data-hz="" /></span>
              ))
              : top.headword}
          </Link>
          <div className={`${s.pr} ${s.fade}`} data-ipa={lang === 'zh' ? undefined : ''} style={DELAY}>{pron}</div>
          <div className={`${s.gl} ${s.fade}`} style={DELAY}>{top.glossVi}</div>
          <div className={`${s.also} ${s.fade}`} style={DELAY}>
            {list.length > 1 && <>Cũng là {list.slice(1, 3).map((e, i) => (
              <span key={e.id}>{i > 0 && ', '}<Link href={entryPath(e.id)} prefetch={false} lang={lang}>{e.headword}</Link></span>
            ))}</>}
          </div>
          <div className={`${s.acts} ${s.fade}`} style={DELAY}>
            <AudioButton text={top.headword} lang={lang} audioUrl={top.audioUrl} label="Nghe" tone="pane" />
            <AddToWordlistButton entry={top} tone="pane" />
          </div>
        </Fragment>
      ) : shown && (
        <div key={shown.seq} className={`${s.none} ${s.fade}`}>
          <p>Chưa có từ {NAME[lang].replace('Tiếng', 'tiếng')} cho “{shown.query}”.</p>
          <p className={s.try}>Thử <button type="button" onClick={() => onTry(two[0])}>{two[0]}</button> hoặc <button type="button" onClick={() => onTry(two[1])}>{two[1]}</button>.</p>
        </div>
      )}
    </div>
  )
}

const DELAY = { animationDelay: '60ms' }

/** Steps the word down the type scale until it fits its lane. */
function fitWord(w: HTMLElement): void {
  delete w.dataset.fit
  const box = w.parentElement?.parentElement
  if (!box) return
  const cs = getComputedStyle(box)
  const max = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
  if (w.scrollWidth > max) w.dataset.fit = '1'
  if (w.scrollWidth > max) w.dataset.fit = '2'
}
