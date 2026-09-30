'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MIN_PASSWORD, setPassword, signOut } from '@/lib/auth/account'
import { setDisplayName, type Profile } from '@/lib/auth/profile'
import { listWords } from '@/lib/wordlist/store'
import { wordsToCsv, wordsToAnkiTsv } from '@/lib/wordlist/csv'
import { downloadTextFile } from '@/lib/wordlist/download'
import { formatWordDate } from '@/lib/wordlist/format'
import { WordlistStats } from '@/components/wordlist/WordlistStats'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { STATUS_OPTIONS } from '@/lib/wordlist/types'
import { LANGUAGES } from '@/lib/languages'
import type { WordlistStats as Stats } from '@/lib/wordlist/stats'
import { Said } from './Said'
import s from './Account.module.css'

type Feedback = { tone: 'ok' | 'bad'; text: string } | null

const ROLE_LABEL: Record<Profile['role'], string> = {
  learner: 'Người học',
  admin: 'Quản trị',
}

/**
 * Everything an account owner can change about their own account.
 *
 * The role is shown and not editable: RLS refuses an update that changes it, so a
 * control here would be a button that always fails. It is granted in the database.
 *
 * No mail is sent by this deployment, so a forgotten password is replaced here while
 * still signed in; there is no reset link.
 */
export function AccountSettings({
  email, profile, stats, joinedAt,
}: {
  email: string
  profile: Profile | null
  stats: Stats
  /** When the account was created, as `auth.users.created_at` holds it. */
  joinedAt: string | null
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [name, setName] = useState(profile?.displayName ?? '')
  const [password, setPasswordValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null)
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null)
  const [exporting, setExporting] = useState(false)
  const [exportFeedback, setExportFeedback] = useState<Feedback>(null)

  // The whole notebook, not the page the wordlist happens to be showing: an export is
  // the copy a learner keeps, so a partial one would be worse than none.
  async function exportAll(kind: 'csv' | 'anki') {
    if (exporting) return
    setExporting(true)
    try {
      const words = await listWords(supabase)
      if (kind === 'csv') downloadTextFile('wordlist.csv', wordsToCsv(words), 'text/csv;charset=utf-8')
      else downloadTextFile('wordlist-anki.tsv', wordsToAnkiTsv(words), 'text/tab-separated-values;charset=utf-8')
      // The browser shows the download itself, so success needs no message -- but the
      // failure left by an earlier attempt has to go.
      setExportFeedback(null)
    } catch {
      setExportFeedback({ tone: 'bad', text: 'Chưa tải được sổ tay. Thử lại.' })
    } finally {
      setExporting(false)
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setNameFeedback(null)
    const outcome = await setDisplayName(supabase, name)
    setNameFeedback(outcome.ok ? { tone: 'ok', text: 'Đã lưu.' } : { tone: 'bad', text: outcome.message })
    setBusy(false)
    if (outcome.ok) router.refresh()
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setPasswordFeedback(null)
    const outcome = await setPassword(supabase, password)
    if (outcome.status === 'active') {
      setPasswordValue('')
      setPasswordFeedback({ tone: 'ok', text: 'Đã đặt mật khẩu mới.' })
    } else {
      // `setPassword` returns only 'active' or 'error' today, but an `else if` on
      // 'error' would leave the form silent if that ever changes.
      const text = outcome.status === 'error' ? outcome.message : 'Chưa đặt được mật khẩu. Thử lại.'
      setPasswordFeedback({ tone: 'bad', text })
    }
    setBusy(false)
  }

  const langs = LANGUAGES.filter((l) => stats.byLang[l.code] > 0)

  return (
    <div className={s.board}>
      <section className={s.who}>
        <span aria-hidden="true" className={s.mono}>{email.charAt(0)}</span>
        <div className={s.whoText}>
          <p className={s.whoLabel}>Đã đăng nhập bằng</p>
          <p className={s.email}>{email}</p>
          <p className={s.whoMeta}>
            <span className={s.role}>{ROLE_LABEL[profile?.role ?? 'learner']}</span>
            {joinedAt && <span>Tham gia {formatWordDate(joinedAt)}</span>}
          </p>
        </div>
        <button
          type="button"
          className={s.ghost}
          onClick={async () => {
            await signOut(supabase)
            router.push('/')
            router.refresh()
          }}
        >
          Đăng xuất
        </button>
      </section>

      <section className={s.panel} data-m="progress" data-i="1">
        <h2>Tiến độ</h2>
        {stats.total === 0 ? (
          <p className={s.empty}>
            Chưa có từ. Tra một từ để lưu.
          </p>
        ) : (
          <WordlistStats stats={stats} />
        )}
        {stats.total > 0 && (
          <div className={s.splits}>
            {/* Each bar draws the line under it, in the same order. */}
            <div>
              <div aria-hidden="true" className={s.meter}>
                {STATUS_OPTIONS.filter(([key]) => stats.byStatus[key] > 0).map(([key]) => (
                  <i key={key} data-s={key} style={{ flexGrow: stats.byStatus[key] }} />
                ))}
              </div>
              <p className={s.split}>
                {STATUS_OPTIONS.map(([key, label]) => `${label} ${stats.byStatus[key]}`).join(' · ')}
              </p>
            </div>
            <div>
              <div aria-hidden="true" className={s.meter}>
                {langs.map((l) => (
                  <i key={l.code} data-l={l.code} style={{ flexGrow: stats.byLang[l.code] }} />
                ))}
              </div>
              <p className={s.split}>
                {langs.map((l) => `${l.name} ${stats.byLang[l.code]}`).join(' · ')}
              </p>
            </div>
          </div>
        )}
      </section>

      <div className={s.grid}>
        <section className={s.panel} data-m="theme" data-i="3">
          <h2>Giao diện</h2>
          <p>Chọn giao diện cho trình duyệt này.</p>
          <div className={s.row}>
            <ThemeToggle />
          </div>
        </section>

        <section className={s.panel} data-m="name" data-i="4">
          <h2>Tên hiển thị</h2>
          <form onSubmit={saveName} className={s.row}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Không bắt buộc"
              aria-label="Tên hiển thị"
              className={s.field}
            />
            <button type="submit" disabled={busy} className={s.ghost}>
              Lưu
            </button>
          </form>
          {nameFeedback && <Said tone={nameFeedback.tone} text={nameFeedback.text} />}
        </section>

        <section className={s.panel} data-m="password" data-i="5">
          <h2>Mật khẩu</h2>
          <p>Đổi mật khẩu đăng nhập.</p>
          {/* noValidate: the browser's bubble is English; `setPassword` checks in Vietnamese. */}
          <form onSubmit={savePassword} noValidate className={s.row}>
            {/* Tells a password manager which saved account the new password belongs to. */}
            <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
            <input
              id="new-password"
              name="new-password"
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder={`Ít nhất ${MIN_PASSWORD} ký tự`}
              aria-label="Mật khẩu mới"
              className={s.field}
            />
            <button type="submit" disabled={busy} className={s.btn}>
              Đặt mật khẩu
            </button>
          </form>
          {passwordFeedback && <Said tone={passwordFeedback.tone} text={passwordFeedback.text} />}
        </section>

        <section className={s.panel} data-m="data" data-i="6">
          <h2>Dữ liệu</h2>
          <p>Tải cả sổ tay về máy.</p>
          <div className={s.row}>
            <button
              type="button"
              onClick={() => void exportAll('csv')}
              disabled={exporting || stats.total === 0}
              className={s.ghost}
            >
              <DownloadGlyph />
              Tải CSV
            </button>
            <button
              type="button"
              onClick={() => void exportAll('anki')}
              disabled={exporting || stats.total === 0}
              className={s.ghost}
            >
              <DownloadGlyph />
              Tải Anki (TSV)
            </button>
          </div>
          {exportFeedback && <Said tone={exportFeedback.tone} text={exportFeedback.text} />}
        </section>
      </div>
    </div>
  )
}

function DownloadGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5v8M4.75 7.5 8 10.75l3.25-3.25M3 13.5h10" />
    </svg>
  )
}
