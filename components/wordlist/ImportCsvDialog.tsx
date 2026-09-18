'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
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
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal keeps its children mounted while closed, so clear the preview on reopen.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setRows([]); setFileName(''); setImporting(false); setError(null) }
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    setError(null)
    try {
      setRows(parseImportCsv(await file.text(), existing))
    } catch {
      // An unreadable file, or a parse error that is not the quote case the parser
      // reports as a preview row. Without this the dialog gives a file name and no reason.
      setRows([])
      setError('Không đọc được file này. Kiểm tra lại rồi chọn file khác.')
    }
  }

  const okRows = rows.filter((r): r is Extract<ImportPreviewRow, { kind: 'ok' }> => r.kind === 'ok')
  const duplicateCount = rows.filter((r) => r.kind === 'duplicate').length
  const errorCount = rows.filter((r) => r.kind === 'error').length

  async function handleImport() {
    if (okRows.length === 0) return
    setImporting(true)
    setError(null)
    try {
      await onImport(okRows.map((r) => r.draft))
      onClose()
    } catch {
      // Shown in the dialog rather than over it: the file name and the preview
      // are the context for the failure, and both are on this screen.
      setError('Không nhập được. Vui lòng thử lại.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nhập từ CSV" titleId="import-csv-title" widthClass="max-w-xl">

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

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <button className="rounded-lg border border-black/15 px-4 py-2 text-sm" onClick={onClose}>Hủy</button>
          <button
            className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={handleImport}
            disabled={okRows.length === 0 || importing}
          >
            {importing ? 'Đang nhập…' : `Nhập ${okRows.length} từ`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
