'use client'
import { PAGE_SIZES, isPageSize, type PageSize } from '@/lib/wordlist/paginate'

interface Props {
  page: number
  pageCount: number
  pageSize: PageSize
  total: number
  from: number
  to: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: PageSize) => void
}

const BUTTON = 'rounded-lg border border-black/15 px-2.5 py-1.5 text-sm text-black/70 hover:bg-black/5 disabled:opacity-35 disabled:hover:bg-transparent'

export function Pagination({
  page, pageCount, pageSize, total, from, to, onPageChange, onPageSizeChange,
}: Props) {
  const first = page <= 1
  const last = page >= pageCount

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm" aria-label="Phân trang">
      <span className="text-black/50">
        {total === 0 ? 'Không có từ nào' : `${from}-${to} trong ${total} từ`}
      </span>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-black/50">
          Mỗi trang
          <select
            value={pageSize}
            onChange={(e) => {
              const size = Number(e.target.value)
              if (isPageSize(size)) onPageSizeChange(size)
            }}
            className="rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm text-black"
            aria-label="Số từ mỗi trang"
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button className={BUTTON} onClick={() => onPageChange(1)} disabled={first} aria-label="Trang đầu">«</button>
          <button className={BUTTON} onClick={() => onPageChange(page - 1)} disabled={first} aria-label="Trang trước">‹</button>
          <span className="px-2 text-black/60" aria-live="polite">Trang {page} / {pageCount}</span>
          <button className={BUTTON} onClick={() => onPageChange(page + 1)} disabled={last} aria-label="Trang sau">›</button>
          <button className={BUTTON} onClick={() => onPageChange(pageCount)} disabled={last} aria-label="Trang cuối">»</button>
        </div>
      </div>
    </nav>
  )
}
