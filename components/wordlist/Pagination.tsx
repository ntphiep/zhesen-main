'use client'
import { PAGE_SIZES, isPageSize, type PageSize } from '@/lib/wordlist/paginate'
import s from './Wordlist.module.css'

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

export function Pagination({
  page, pageCount, pageSize, total, from, to, onPageChange, onPageSizeChange,
}: Props) {
  const first = page <= 1
  const last = page >= pageCount

  return (
    <nav className={s.pager} aria-label="Phân trang">
      <span>
        {total === 0 ? 'Không có từ nào' : `${from}-${to} trong ${total} từ`}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 whitespace-nowrap">
          Mỗi trang
          <select
            value={pageSize}
            onChange={(e) => {
              const size = Number(e.target.value)
              if (isPageSize(size)) onPageSizeChange(size)
            }}
            className={s.field}
            aria-label="Số từ mỗi trang"
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <button className={s.step} onClick={() => onPageChange(1)} disabled={first} aria-label="Trang đầu">«</button>
          <button className={s.step} onClick={() => onPageChange(page - 1)} disabled={first} aria-label="Trang trước">‹</button>
          <span className="whitespace-nowrap px-2 font-semibold tabular-nums" aria-live="polite">Trang {page} / {pageCount}</span>
          <button className={s.step} onClick={() => onPageChange(page + 1)} disabled={last} aria-label="Trang sau">›</button>
          <button className={s.step} onClick={() => onPageChange(pageCount)} disabled={last} aria-label="Trang cuối">»</button>
        </div>
      </div>
    </nav>
  )
}
