import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { getAdminEntry, getCoverage } from '@/lib/admin/content'
import { searchOneDirection } from '@/lib/dictionary/search'
import { LANGUAGES } from '@/lib/languages'
import { EntryEditor } from '@/components/admin/EntryEditor'

export const metadata = { title: 'Nội dung · Quản trị' }

const LANG_NAME = new Map(LANGUAGES.map((l) => [l.code, l.name]))
const count = (n: number) => n.toLocaleString('vi-VN')
const editHref = (id: string) => `/admin/content?entry=${encodeURIComponent(id)}`

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  await requireAdmin(supabase)
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const dir = sp.dir === 'vi' ? 'vi' : 'fw'
  const entryId = typeof sp.entry === 'string' ? sp.entry : ''

  const [coverage, found, entry] = await Promise.all([
    getCoverage(supabase),
    q ? searchOneDirection(supabase, q, dir) : null,
    entryId ? getAdminEntry(supabase, entryId) : null,
  ])
  const results = found ? LANGUAGES.flatMap((l) => found.entries[l.code]) : []

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Độ phủ</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs font-medium uppercase tracking-wide text-black/45">
                <th className="py-2 pr-4">Ngôn ngữ</th>
                <th className="py-2 pr-4 text-right">Mục từ</th>
                <th className="py-2 pr-4 text-right">Nghĩa</th>
                <th className="py-2 pr-4 text-right">Có nghĩa tiếng Việt</th>
                <th className="py-2 pr-4 text-right">Trong đó dịch máy</th>
                <th className="py-2 text-right">Đang đánh dấu</th>
              </tr>
            </thead>
            <tbody>
              {coverage.languages.map((l) => (
                <tr key={l.lang} className="border-b border-black/5">
                  <td className="py-1.5 pr-4">{LANG_NAME.get(l.lang)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{count(l.entries)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{count(l.senses)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{count(l.sensesVi)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{count(l.sensesMt)}</td>
                  <td className="py-1.5 text-right tabular-nums">{count(l.flagged)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {coverage.flagged.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {coverage.flagged.map((f) => (
              <li key={f.entryId}>
                <Link href={editHref(f.entryId)} prefetch={false} className="font-medium hover:underline">
                  {f.headword}
                </Link>
                <span className="text-black/50"> · {LANG_NAME.get(f.lang)} · {f.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tìm mục từ</h2>
        <form action="/admin/content" className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Từ cần sửa"
            aria-label="Từ cần tìm"
            className="min-w-56 flex-1 rounded-lg border border-black/15 px-3 py-2 text-sm"
          />
          <select
            name="dir"
            defaultValue={dir}
            aria-label="Chiều tra"
            className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm"
          >
            <option value="fw">Theo từ gốc</option>
            <option value="vi">Theo nghĩa tiếng Việt</option>
          </select>
          <button type="submit" className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
            Tìm
          </button>
        </form>
        {q && results.length === 0 && <p className="mt-3 text-sm text-black/60">Không có mục từ nào khớp.</p>}
        {results.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {results.map((r) => (
              <li key={r.id}>
                <Link href={editHref(r.id)} prefetch={false} className="font-medium hover:underline">
                  {r.headword}
                </Link>
                <span className="text-black/50"> · {LANG_NAME.get(r.lang)}{r.glossVi ? ` · ${r.glossVi}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {entryId && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Sửa mục từ</h2>
          {entry ? <EntryEditor key={entry.id} entry={entry} /> : (
            <p className="text-sm text-black/60">Không có mục từ {entryId}.</p>
          )}
        </section>
      )}
    </div>
  )
}
