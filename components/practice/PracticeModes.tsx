import Link from 'next/link'
import type { ReactNode } from 'react'
import { MIC } from '@/components/practice/SessionParts'
import p from './Practice.module.css'

export interface PracticeModeLink {
  href: string
  label: string
  sub: string
  primary: boolean
  /** The skill the mode trains, which the hub groups by. */
  group: PracticeGroup
}

export type PracticeGroup = 'Ôn theo lịch' | 'Nghe' | 'Đọc' | 'Viết' | 'Nói'

const GROUPS: readonly PracticeGroup[] = ['Ôn theo lịch', 'Nghe', 'Đọc', 'Viết', 'Nói']

/** Every way to practise, shared by /practice and the signed-in home. `due` is the session's
 *  size, or null while it is still being counted. */
export function practiceModes(due: number | null): PracticeModeLink[] {
  return [
    { href: '/practice/review', label: 'Ôn từ', sub: due === null ? 'Tự chấm Lại, Khó, Tốt hay Dễ' : due > 0 ? `${due} từ cần ôn` : 'Chưa có từ đến hạn', primary: (due ?? 0) > 0, group: 'Ôn theo lịch' },
    { href: '/practice/dictation', label: 'Nghe và chép', sub: 'Nghe rồi gõ từ', primary: false, group: 'Nghe' },
    { href: '/practice/listen', label: 'Nghe chọn nghĩa', sub: 'Nghe rồi chọn nghĩa', primary: false, group: 'Nghe' },
    { href: '/practice/quiz', label: 'Kiểm tra', sub: 'Chọn nghĩa đúng', primary: false, group: 'Đọc' },
    { href: '/practice/match', label: 'Ghép cặp', sub: 'Nối từ với nghĩa', primary: false, group: 'Đọc' },
    { href: '/practice/ipa', label: 'Đọc phiên âm', sub: 'Nhìn IPA, gõ từ', primary: false, group: 'Đọc' },
    { href: '/practice/phrase', label: 'Ghép cụm từ', sub: 'Chọn từ còn thiếu trong cụm', primary: false, group: 'Đọc' },
    { href: '/practice/toeic', label: 'Đề TOEIC Reading', sub: 'Làm đề 75 phút hoặc từng Part', primary: false, group: 'Đọc' },
    { href: '/practice/write', label: 'Viết từ', sub: 'Nhìn nghĩa, gõ từ', primary: false, group: 'Viết' },
    { href: '/practice/cloze', label: 'Điền vào câu', sub: 'Gõ từ còn thiếu trong câu', primary: false, group: 'Viết' },
    { href: '/practice/forms', label: 'Dạng từ', sub: 'Gõ quá khứ, số nhiều, so sánh', primary: false, group: 'Viết' },
    { href: '/practice/speak', label: 'Luyện nói', sub: 'Nhìn nghĩa, nói to từ', primary: false, group: 'Nói' },
  ]
}

const ICON = { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
/** The first six are the mode icons of the landing page's review demo (components/home/ReviewDemo.tsx). */
const ICONS: Record<string, ReactNode> = {
  '/practice/review': <svg {...ICON}><rect x="3" y="5" width="11" height="12" rx="2" /><path d="M7 3h8a2 2 0 0 1 2 2v9" /></svg>,
  '/practice/quiz': <svg {...ICON}><circle cx="10" cy="10" r="7" /><path d="m7 10 2.2 2.2L13.5 8" /></svg>,
  '/practice/write': <svg {...ICON}><path d="M4 16l.8-3.4L13 4.4a1.6 1.6 0 0 1 2.3 0l.3.3a1.6 1.6 0 0 1 0 2.3L7.4 15.2z" /><path d="M11.5 6l2.5 2.5" /></svg>,
  '/practice/dictation': <svg {...ICON}><path d="M4 12v-2a6 6 0 0 1 12 0v2" /><rect x="3" y="12" width="3.5" height="5" rx="1.2" /><rect x="13.5" y="12" width="3.5" height="5" rx="1.2" /></svg>,
  '/practice/match': <svg {...ICON}><circle cx="5" cy="6" r="2" /><circle cx="15" cy="14" r="2" /><path d="M7 6h3a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h-1" /></svg>,
  '/practice/speak': MIC,
  '/practice/listen': <svg {...ICON}><path d="M3.5 8v4h3l4 3.5v-11L6.5 8z" /><path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.5 5.5a6.4 6.4 0 0 1 0 9" /></svg>,
  '/practice/ipa': <svg {...ICON}><path d="M7 4 4 16M16 4l-3 12" /><path d="M8.5 10.5h3" /></svg>,
  '/practice/phrase': <svg {...ICON}><rect x="2.5" y="7" width="6" height="6" rx="1.5" /><rect x="11.5" y="7" width="6" height="6" rx="1.5" strokeDasharray="2 2" /><path d="M8.5 10h3" /></svg>,
  '/practice/cloze': <svg {...ICON}><path d="M3 6h14M3 10h4M13 10h4M3 14h9" /><path d="M8.5 11.5h3" /></svg>,
  '/practice/forms': <svg {...ICON}><path d="M4 10h5M9 10l3-4h4M9 10l3 4h4" /></svg>,
  '/practice/toeic': <svg {...ICON}><rect x="4" y="3" width="12" height="14" rx="2" /><path d="M7 7h6M7 10h6M7 13h3" /></svg>,
}

export function PracticeModes({ due }: { due: number }) {
  const modes = practiceModes(due)
  return (
    <div className={p.groups}>
      {GROUPS.map((group) => (
        <section key={group} aria-label={group}>
          <h2 className={p.group}>{group}</h2>
          <div className={p.modes}>
            {modes.filter((m) => m.group === group).map((m) => (
              <Link key={m.href} href={m.href} className={p.mode} data-primary={m.primary || undefined} data-i={Math.min(modes.indexOf(m), 5)}>
                <span className={p.ic}>{ICONS[m.href]}</span>
                <b>{m.label}</b>
                <small>{m.sub}</small>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
