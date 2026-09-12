'use client'
import { useEffect, useRef, useState } from 'react'
import { parseImportCsv, type ImportPreviewRow } from '@/lib/wordlist/csv'
import type { UserWord, WordDraft } from '@/lib/wordlist/types'

interface Props {
  open: boolean
  onClose: () => void
  existing: UserWord[]
  onImport: (drafts: WordDraft[]) => void | Promise<void>
}

const KIND_LABEL: Record<ImportPreviewRow['kind'], string> = {
  ok: 'Sẽ nhập',
  duplicate: 'Trùng, bỏ qua',
  error: 'Lỗi, bỏ qua',
}

const KIND_CLASS: Record<ImportPreviewRow['kind'], string> = {
  ok: 'text-green-700 bg-green-50',
  duplicate: 'text-black/50 bg-black/5',
  error: 'text-red-700 bg-red-50',
}

export function ImportCsvDialog({ open, onClose, existing, onImport }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  // Reset preview whenever the dialog is (re)opened.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setRows([]); setFileName(''); setImporting(false) }
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    const text = await file.text()
    setRows(parseImportCsv(text, existing))
  }

  const okRows = rows.filter((r): r is Extract<ImportPreviewRow, { kind: 'ok' }> => r.kind === 'ok')
  const duplicateCount = rows.filter((r) => r.kind === 'duplicate').length
  const errorCount = rows.filter((r) => r.kind === 'error').length

  async function handleImport() {
    if (okRows.length === 0) return
    setImporting(true)
    try {
      await onImport(okRows.map((r) => r.draft))
      onClose()
    } catch {
      alert('Không nhập được. Vui lòng thử lại.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="import-csv-title"
      className="rounded-xl bg-white shadow-xl p-0 w-full max-w-xl backdrop:bg-black/30"
      onClose={onClose}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-0">
        <h2 id="import-csv-title" className="text-lg font-semibold">Nhập từ CSV</h2>
        <button className="text-black/40 hover:text-black/70 text-xl leading-none" onClick={onClose} aria-label="Đóng">×</button>
      </div>

      <div className="p-5 flex flex-col gap-3">
        <p className="text-sm text-black/60">
          Chọn file CSV (cùng định dạng với file xuất ra từ sổ tay: cột đầu là <code>headword</code>).
          Từ đã có trong sổ tay (cùng ngôn ngữ, cùng từ) sẽ được bỏ qua.
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-black/50">File CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Chọn file CSV"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
            className="text-sm"
          />
        </label>

        {fileName && rows.length > 0 && (
          <>
            <div className="flex gap-3 text-sm">
              <span className="text-green-700">{okRows.length} sẽ nhập</span>
              {duplicateCount > 0 && <span className="text-black/50">{duplicateCount} trùng</span>}
              {errorCount > 0 && <span className="text-red-700">{errorCount} lỗi</span>}
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border border-black/10">
              <table className="w-full text-xs">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-b border-black/5 last:border-0">
                      <td className="px-2 py-1 text-black/40">{r.line}</td>
                      <td className="px-2 py-1">
                        {r.kind === 'error' ? r.message : `${r.draft.headword} (${r.draft.lang})`}
                      </td>
                      <td className="px-2 py-1">
                        <span className={`rounded px-1.5 py-0.5 ${KIND_CLASS[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {fileName && rows.length === 0 && (
          <p className="text-sm text-black/40">File không có dữ liệu.</p>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <button className="rounded-lg border border-black/15 px-4 py-2 text-sm" onClick={onClose}>Hủy</button>
          <button
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={handleImport}
            disabled={okRows.length === 0 || importing}
          >
            {importing ? 'Đang nhập...' : `Nhập ${okRows.length} từ`}
          </button>
        </div>
      </div>
    </dialog>
  )
}
