import Link from 'next/link'
import type { ReactNode } from 'react'
import { MIC } from '@/components/practice/SessionParts'
import p from './Practice.module.css'

export interface PracticeModeLink {
  href: string
  label: string
  sub: string
  primary: boolean
}

/** The six ways to practise, shared by /practice and the signed-in home. `due` is the
 *  session's size, or null while it is still being counted. */
export function practiceModes(due: number | null): PracticeModeLink[] {
  return [
    { href: '/practice/review', label: 'Ôn từ', sub: due === null ? 'Tự chấm Lại, Khó, Tốt hay Dễ' : due > 0 ? `${due} từ cần ôn` : 'Chưa có từ đến hạn', primary: (due ?? 0) > 0 },
    { href: '/practice/quiz', label: 'Kiểm tra', sub: 'Chọn nghĩa đúng', primary: false },
    { href: '/practice/write', label: 'Viết từ', sub: 'Nhìn nghĩa, gõ từ', primary: false },
    { href: '/practice/dictation', label: 'Nghe và chép', sub: 'Nghe rồi gõ từ', primary: false },
    { href: '/practice/match', label: 'Ghép cặp', sub: 'Nối từ với nghĩa', primary: false },
    { href: '/practice/speak', label: 'Luyện nói', sub: 'Đọc to, kiểm tra phát âm', primary: false },
  ]
}

const ICON = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
/** The mode icons of the landing page's review demo (components/home/ReviewDemo.tsx). */
const ICONS: Record<string, ReactNode> = {
  '/practice/review': <svg {...ICON}><rect x="3" y="5" width="11" height="12" rx="2" /><path d="M7 3h8a2 2 0 0 1 2 2v9" /></svg>,
  '/practice/quiz': <svg {...ICON}><circle cx="10" cy="10" r="7" /><path d="m7 10 2.2 2.2L13.5 8" /></svg>,
  '/practice/write': <svg {...ICON}><path d="M4 16l.8-3.4L13 4.4a1.6 1.6 0 0 1 2.3 0l.3.3a1.6 1.6 0 0 1 0 2.3L7.4 15.2z" /><path d="M11.5 6l2.5 2.5" /></svg>,
  '/practice/dictation': <svg {...ICON}><path d="M4 12v-2a6 6 0 0 1 12 0v2" /><rect x="3" y="12" width="3.5" height="5" rx="1.2" /><rect x="13.5" y="12" width="3.5" height="5" rx="1.2" /></svg>,
  '/practice/match': <svg {...ICON}><circle cx="5" cy="6" r="2" /><circle cx="15" cy="14" r="2" /><path d="M7 6h3a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h-1" /></svg>,
  '/practice/speak': MIC,
}

export function PracticeModes({ due }: { due: number }) {
  return (
    <div className={p.modes}>
      {practiceModes(due).map((m, i) => (
        <Link key={m.href} href={m.href} className={p.mode} data-primary={m.primary || undefined} data-i={i}>
          <span className={p.ic}>{ICONS[m.href]}</span>
          <b>{m.label}</b>
          <small>{m.sub}</small>
        </Link>
      ))}
    </div>
  )
}
