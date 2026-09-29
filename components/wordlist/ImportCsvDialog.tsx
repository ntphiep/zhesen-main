'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { parseImportCsv, type ImportPreviewRow } from '@/lib/wordlist/csv'
import type { UserWord, WordDraft } from '@/lib/wordlist/types'
import s from './Wordlist.module.css'

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
      setError('Không đọc được file này. Chọn file khác.')
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
      setError('Chưa nhập được. Thử lại.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nhập từ CSV" titleId="import-csv-title" widthClass="max-w-xl">

      <div className="p-5 flex flex-col gap-3">
        <p className={`text-sm ${s.pron}`}>
          Chọn file CSV có cột đầu là <code>headword</code>, như file xuất từ sổ tay.
        </p>

        <label className="flex flex-col gap-1">
          <span className={s.label}>File CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Chọn file CSV"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
            className={`${s.note} file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-(--zs-chip) file:px-4 file:font-semibold file:text-(--zs-ink)`}
          />
        </label>

        {fileName && rows.length > 0 && (
          <>
            <div className="flex gap-3 text-sm font-semibold">
              <span>{okRows.length} sẽ nhập</span>
              {duplicateCount > 0 && <span className={s.pron}>{duplicateCount} trùng</span>}
              {errorCount > 0 && <span className={s.pron}>{errorCount} lỗi</span>}
            </div>

            <div className={s.preview}>
              <table className="w-full">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line}>
                      <td className={`${s.pron} w-12 tabular-nums`}>{r.line}</td>
                      <td>
                        {r.kind === 'error' ? r.message : `${r.draft.headword} (${r.draft.lang})`}
                      </td>
                      <td className="text-right">
                        <span className={s.kind} data-k={r.kind}>{KIND_LABEL[r.kind]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {fileName && rows.length === 0 && (
          <p className={s.note}>File trống.</p>
        )}

        {error && (
          <p role="alert" className={s.alert}>{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <button className={s.ghost} onClick={onClose}>Hủy</button>
          <button
            className={s.btn}
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
