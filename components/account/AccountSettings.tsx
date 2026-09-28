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

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-black/10 px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-black/60">Đã đăng nhập bằng</span>
          <span className="font-medium">{email}</span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/60">
            {ROLE_LABEL[profile?.role ?? 'learner']}
          </span>
          <button
            className="ml-auto text-black/60 hover:text-black hover:underline"
            onClick={async () => {
              await signOut(supabase)
              router.push('/')
              router.refresh()
            }}
          >
            Đăng xuất
          </button>
        </div>
        {joinedAt && (
          <p className="mt-1 text-xs text-black/55">Tham gia {formatWordDate(joinedAt)}</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Tiến độ</h2>
        {stats.total === 0 ? (
          <p className="mt-1 text-sm text-black/60">
            Chưa có từ. Tra một từ để lưu.
          </p>
        ) : (
          <WordlistStats stats={stats} />
        )}
        {stats.total > 0 && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-black/60">
            <span>
              {STATUS_OPTIONS.map(([key, label]) => `${label} ${stats.byStatus[key]}`).join(' · ')}
            </span>
            <span>
              {LANGUAGES.filter((l) => stats.byLang[l.code] > 0)
                .map((l) => `${l.name} ${stats.byLang[l.code]}`).join(' · ')}
            </span>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Giao diện</h2>
        <p className="mt-1 text-sm text-black/60">
          Chọn giao diện cho trình duyệt này.
        </p>
        <div className="mt-2">
          <ThemeToggle />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Tên hiển thị</h2>
        <form onSubmit={saveName} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Không bắt buộc"
            aria-label="Tên hiển thị"
            className="min-w-56 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
          >
            Lưu
          </button>
        </form>
        {nameFeedback && (
          <p className={`mt-2 text-sm ${nameFeedback.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {nameFeedback.text}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Mật khẩu</h2>
        <p className="mt-1 text-sm text-black/60">
          Đổi mật khẩu đăng nhập.
        </p>
        {/* noValidate: the browser's bubble is English; `setPassword` checks in Vietnamese. */}
        <form onSubmit={savePassword} noValidate className="mt-2 flex flex-wrap items-center gap-2">
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
            className="min-w-56 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Đặt mật khẩu
          </button>
        </form>
        {passwordFeedback && (
          <p className={`mt-2 text-sm ${passwordFeedback.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {passwordFeedback.text}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Dữ liệu</h2>
        <p className="mt-1 text-sm text-black/60">
          Tải cả sổ tay về máy.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => void exportAll('csv')}
            disabled={exporting || stats.total === 0}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
          >
            Tải CSV
          </button>
          <button
            onClick={() => void exportAll('anki')}
            disabled={exporting || stats.total === 0}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
          >
            Tải Anki (TSV)
          </button>
        </div>
        {exportFeedback && (
          <p className={`mt-2 text-sm ${exportFeedback.tone === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
            {exportFeedback.text}
          </p>
        )}
      </section>
    </div>
  )
}

