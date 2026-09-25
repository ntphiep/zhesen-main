// CSV export/import and Anki-importable TSV export for the personal wordlist: the escape
// hatch from anonymous auth, where clearing cookies loses the wordlist.
import { isLangCode, type LangCode } from '@/lib/languages'
import type { UserWord, WordDraft, WordStatus } from './types'

// `entryId` and `audioUrl` must stay: without them a restored word loses its dictionary
// link and its recording. Both are optional on import, so a hand-written file still works.
const CSV_COLUMNS = [
  'headword', 'lang', 'entryId', 'reading', 'ipa', 'pos', 'meaningVi', 'meaningEn', 'level',
  'example', 'exampleTranslation', 'audioUrl', 'notes', 'status', 'tags', 'createdAt',
] as const

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Serialize words to a CSV a person can open in a spreadsheet and re-import later. */
export function wordsToCsv(words: UserWord[]): string {
  const lines = [CSV_COLUMNS.join(',')]
  for (const w of words) {
    const fields: Record<(typeof CSV_COLUMNS)[number], string> = {
      headword: w.headword,
      lang: w.lang,
      entryId: w.entryId ?? '',
      reading: w.reading ?? '',
      ipa: w.ipa ?? '',
      pos: w.pos ?? '',
      meaningVi: w.meaningVi ?? '',
      meaningEn: w.meaningEn ?? '',
      level: w.level ?? '',
      example: w.example ?? '',
      exampleTranslation: w.exampleTranslation ?? '',
      audioUrl: w.audioUrl ?? '',
      notes: w.notes ?? '',
      status: w.status,
      tags: w.tags.join(';'),
      createdAt: w.createdAt,
    }
    lines.push(CSV_COLUMNS.map((c) => csvEscape(fields[c])).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

function tsvEscape(value: string): string {
  // Anki's TSV importer splits on tabs and reads one note per line: strip both.
  return value.replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
}

/** Serialize words to Anki-style TSV: front, back, tags (space-separated per Anki convention). */
export function wordsToAnkiTsv(words: UserWord[]): string {
  const lines: string[] = []
  for (const w of words) {
    const front = [w.headword, w.ipa].filter(Boolean).join(' ')
    const back = [w.meaningVi ?? w.meaningEn ?? '', w.example ?? ''].filter(Boolean).join(' — ')
    const tags = w.tags.map((t) => t.replace(/\s+/g, '_')).join(' ')
    lines.push([front, back, tags].map(tsvEscape).join('\t'))
  }
  return lines.join('\r\n') + (lines.length > 0 ? '\r\n' : '')
}

// --- CSV import -------------------------------------------------------------------

/** Raised when a quoted field is never closed, which silently swallows the rest of the file. */
export class UnterminatedQuoteError extends Error {
  constructor(public readonly line: number) {
    super(`Dòng ${line} thiếu dấu nháy kép đóng.`)
    this.name = 'UnterminatedQuoteError'
  }
}

/** One parsed row plus the physical line it starts on, so an error can name it. */
export interface CsvRow {
  line: number
  cells: string[]
}

/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields with commas, quotes and
 * newlines, and carries each row's physical line number out with it.
 */
export function parseCsvRows(text: string): CsvRow[] {
  const rows: CsvRow[] = []
  let cells: string[] = []
  let field = ''
  let inQuotes = false
  // Where the currently open quote started, so an unclosed one can name its line.
  let quoteOpenedAt = 0
  // A quote only opens a quoted field at the start of one; elsewhere it is an ordinary
  // character, or `ab"cd` swallows everything up to the next quote.
  let atFieldStart = true
  let line = 1
  let rowLine = 1
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      // A quoted field may span lines, and Windows separates them with CRLF; keeping the
      // CR stores a stray carriage return inside the note. A lone CR is left alone.
      if (c === '\r' && text[i + 1] === '\n') { i++; continue }
      if (c === '\n') line++
      field += c; i++; continue
    }
    if (c === '"' && atFieldStart) { inQuotes = true; quoteOpenedAt = line; atFieldStart = false; i++; continue }
    if (c === ',') { cells.push(field); field = ''; atFieldStart = true; i++; continue }
    // Only a CR belonging to a CRLF pair is a line ending. A lone CR is kept: dropping it
    // turns `d\rog` into `dog` and calls the import clean.
    if (c === '\r' && text[i + 1] === '\n') { i++; continue }
    if (c === '\n') {
      cells.push(field); rows.push({ line: rowLine, cells })
      cells = []; field = ''; atFieldStart = true; line++; rowLine = line; i++; continue
    }
    field += c; atFieldStart = false; i++
  }
  // Still inside a quote means every later line was absorbed into one field. Unreported,
  // a 500-row file with one unbalanced quote on line 12 imports 11 words and drops 489.
  if (inQuotes) throw new UnterminatedQuoteError(quoteOpenedAt)
  if (field.length > 0 || cells.length > 0) { cells.push(field); rows.push({ line: rowLine, cells }) }
  return rows.filter((r) => !(r.cells.length === 1 && r.cells[0] === ''))
}

export type ImportPreviewRow =
  | { kind: 'ok'; line: number; draft: WordDraft }
  | { kind: 'duplicate'; line: number; draft: WordDraft }
  | { kind: 'error'; line: number; message: string }

const STATUS_VALUES: WordStatus[] = ['new', 'learning', 'known']

function existingKey(lang: LangCode, headword: string): string {
  return `${lang}:${headword.trim().toLowerCase()}`
}

/** Parse a CSV export into preview rows: `ok` is new, `duplicate` already exists by lang +
 *  headword case-insensitively or by `entryId`, `error` is missing a required field. The
 *  header must carry at least `headword`; other columns match `CSV_COLUMNS` by name and
 *  are optional. */
export function parseImportCsv(text: string, existing: UserWord[]): ImportPreviewRow[] {
  let table: CsvRow[]
  try {
    table = parseCsvRows(text.trim())
  } catch (e) {
    if (e instanceof UnterminatedQuoteError) {
      return [{ kind: 'error', line: e.line, message: `${e.message} Sửa dòng này rồi nhập lại.` }]
    }
    throw e
  }
  if (table.length === 0) return []
  const header = table[0].cells.map((h) => h.trim())
  const headwordIdx = header.indexOf('headword')
  if (headwordIdx === -1) {
    return [{ kind: 'error', line: table[0].line, message: 'Thiếu cột "headword" trong file CSV.' }]
  }
  const idx = (name: string) => header.indexOf(name)

  const seen = new Set(existing.map((w) => existingKey(w.lang, w.headword)))
  // The unique constraint is on entry_id, not headword, so a row whose spelling was edited
  // after export still collides on insert and must not preview as importable.
  const seenEntryIds = new Set(existing.flatMap((w) => (w.entryId ? [w.entryId] : [])))
  const out: ImportPreviewRow[] = []

  for (let r = 1; r < table.length; r++) {
    const { cells: cols, line } = table[r]
    const headword = (cols[headwordIdx] ?? '').trim()
    if (!headword) { out.push({ kind: 'error', line, message: 'Thiếu từ (headword).' }); continue }

    const langRaw = (idx('lang') >= 0 ? cols[idx('lang')] : '')?.trim() || 'en'
    if (!isLangCode(langRaw)) {
      out.push({ kind: 'error', line, message: `Không nhận ra ngôn ngữ "${langRaw}".` })
      continue
    }
    const lang = langRaw

    const statusRaw = (idx('status') >= 0 ? cols[idx('status')] : '')?.trim() || 'new'
    const status = (STATUS_VALUES as string[]).includes(statusRaw) ? (statusRaw as WordStatus) : 'new'

    const tagsRaw = idx('tags') >= 0 ? cols[idx('tags')] ?? '' : ''
    const tags = tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean)

    const field = (name: string) => {
      const i = idx(name)
      const v = i >= 0 ? (cols[i] ?? '').trim() : ''
      return v.length > 0 ? v : null
    }

    // `user_words` has a foreign key to lex.entries, so keep an entry id only when it is
    // shaped like this row's language ("en:holy"): a violation fails the whole import.
    const entryIdRaw = field('entryId')
    const entryId = entryIdRaw?.startsWith(`${lang}:`) ? entryIdRaw : null

    const draft: WordDraft = {
      lang,
      entryId,
      headword,
      reading: field('reading'),
      ipa: field('ipa'),
      pos: field('pos'),
      meaningVi: field('meaningVi'),
      meaningEn: field('meaningEn'),
      level: field('level'),
      example: field('example'),
      exampleTranslation: field('exampleTranslation'),
      audioUrl: field('audioUrl'),
      notes: field('notes'),
      status,
      tags,
    }

    const key = existingKey(lang, headword)
    if (seen.has(key) || (entryId !== null && seenEntryIds.has(entryId))) {
      out.push({ kind: 'duplicate', line, draft })
      continue
    }
    seen.add(key)
    if (entryId !== null) seenEntryIds.add(entryId)
    out.push({ kind: 'ok', line, draft })
  }
  return out
}
