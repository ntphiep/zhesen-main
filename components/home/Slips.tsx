'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { Slip, SlipKind } from '@/lib/home/landing'
import { AudioButton } from '@/components/ui/AudioButton'
import { onTabKey } from './tabs'
import s from './Landing.module.css'

const KINDS: { id: SlipKind; label: string }[] = [
  { id: 'sound', label: 'Phát âm' },
  { id: 'colloc', label: 'Cụm từ' },
  { id: 'grammar', label: 'Ngữ pháp' },
]

const STRIKE = <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M1 6.2 C 18 4.1, 34 7.4, 52 5.3 S 83 3.9, 99 5.6" /></svg>

/** Where Vietnamese speakers slip: the wrong form struck through, the right one, and why.
 *  The strike draws itself once the cards come into view. */
export function Slips({ slips }: { slips: Record<SlipKind, Slip[]> }) {
  const [i, setI] = useState(0)
  const [seen, setSeen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const kind = KINDS[i].id

  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { setSeen(true); io.disconnect() } }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <>
      <div className={s.tabs} role="tablist" aria-label="Loại lỗi" data-reveal="" data-i="2" onKeyDown={(e) => onTabKey(e, i, KINDS.length, setI)}>
        {KINDS.map((k, n) => (
          <button key={k.id} type="button" role="tab" id={`slip-${k.id}`} aria-selected={n === i} aria-controls="slip-cards" tabIndex={n === i ? 0 : -1} onClick={() => setI(n)}>
            {k.label}
          </button>
        ))}
      </div>
      <div ref={box} data-reveal="" data-i="3">
        <div key={kind} className={s.cards} id="slip-cards" role="tabpanel" aria-labelledby={`slip-${kind}`} data-seen={seen ? '' : undefined}>
          {slips[kind].map((x, n) => (
            <article key={x.said} className={s.card}>
              <span className={s.said} lang={x.saidLang ?? undefined} data-i={n}><span className="sr-only">Cách sai: </span>{x.said}{STRIKE}</span>
              <div className={s.right}>
                <span className="sr-only">Cách đúng: </span>
                <b lang={x.rightLang}>{x.right}</b>
                {x.pron && <span>{x.pron}</span>}
                {x.vi && <span data-vi="">{x.vi}</span>}
              </div>
              <p>{x.why}</p>
              <div className={s.cardFoot}>
                {kind === 'sound' ? <AudioButton text={x.right} lang="en" label="Nghe" tone="chip" /> : <span />}
                <Link href={x.href} prefetch={false}>{x.linkText}</Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  )
}
