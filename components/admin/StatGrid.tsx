import { formatBytes, rowsOf, type Metrics } from '@/lib/admin/metrics'
import { formatWordDate } from '@/lib/wordlist/format'

const count = (n: number | null) => (n === null ? '–' : n.toLocaleString('vi-VN'))

/** The data dashboard on /admin: headline numbers, then every table with its exact row
 *  count and size, from `admin.metrics()`. */
export function StatGrid({ metrics: m }: { metrics: Metrics }) {
  const cards = [
    { label: 'Mục từ', value: count(rowsOf(m, 'lex', 'entries')) },
    { label: 'Nghĩa', value: count(rowsOf(m, 'lex', 'senses')) },
    {
      label: 'Tài khoản',
      value: count(m.accounts.total),
      note: `${m.accounts.permanent} có email, ${m.accounts.anonymous} ẩn danh`,
    },
    { label: 'Từ đã lưu', value: count(rowsOf(m, 'public', 'user_words')) },
    { label: 'Database', value: formatBytes(m.databaseBytes) },
    { label: 'PGroonga', value: formatBytes(m.pgroongaBytes), note: 'ngoài các bảng' },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-black/10 px-4 py-3">
            <div className="text-2xl font-semibold">{c.value}</div>
            <div className="text-xs text-black/50">{c.label}</div>
            {c.note && <div className="mt-0.5 text-xs text-black/40">{c.note}</div>}
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm text-black/60">
        Database {formatBytes(m.databaseBytes)}, các bảng và index của Postgres {formatBytes(m.relationBytes)}.
        Phần chênh {formatBytes(m.pgroongaBytes)} là dữ liệu PGroonga, vì PGroonga lưu index tìm kiếm
        trong file riêng mà Postgres không tính vào bảng nào. {m.pgroongaIndexes} index PGroonga
        {m.pgroongaSurplus > 0
          ? `, ${m.pgroongaSurplus} bộ dữ liệu thừa của index đã bị thay; chạy vacuum lex.entries để dọn.`
          : ', không có bộ dữ liệu thừa.'}
      </p>
      {m.lexUpdatedAt && (
        <p className="mt-1 text-sm text-black/60">Mục từ được cập nhật lần cuối {formatWordDate(m.lexUpdatedAt)}.</p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-xs font-medium uppercase tracking-wide text-black/45">
              <th className="py-2 pr-4">Bảng</th>
              <th className="py-2 pr-4 text-right">Số dòng</th>
              <th className="py-2 text-right">Dung lượng</th>
            </tr>
          </thead>
          <tbody>
            {m.tables.map((t) => (
              <tr key={`${t.schema}.${t.name}`} className="border-b border-black/5">
                <td className="py-1.5 pr-4 font-mono text-xs">{t.schema}.{t.name}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{count(t.rows)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBytes(t.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
