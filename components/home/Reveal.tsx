'use client'
import { useEffect, useRef, type ReactNode } from 'react'

/** The landing page's root. Headings, cards and tiles marked `data-reveal` rise once as
 *  they enter the viewport; without script, or under reduced motion, they simply show. */
export function Reveal({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return
      e.target.setAttribute('data-in', '')
      io.unobserve(e.target)
    }), { threshold: 0.15, rootMargin: '0px 0px -8% 0px' })
    root.querySelectorAll('[data-reveal]:not([data-in])').forEach((el) => io.observe(el))
    root.setAttribute('data-reveal-on', '')
    return () => io.disconnect()
  }, [])
  return <main ref={ref} className={className}>{children}</main>
}
