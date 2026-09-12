// CSV export/import and Anki-importable TSV export for the personal wordlist. This is
// the anti-data-loss escape hatch: the wordlist lives behind anonymous auth, so clearing
// cookies loses it; export/import lets a user back it up and restore it elsewhere.
import { isLangCode, type LangCode } from '@/lib/languages'
import type { UserWord, WordDraft, WordStatus } from './types'

const CSV_COLUMNS = [
  'headword', 'lang', 'reading', 'ipa', 'pos', 'meaningVi', 'meaningEn', 'level',
  'example', 'exampleTranslation', 'notes', 'status', 'tags', 'createdAt',
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
      reading: w.reading ?? '',
      ipa: w.ipa ?? '',
      pos: w.pos ?? '',
      meaningVi: w.meaningVi ?? '',
      meaningEn: w.meaningEn ?? '',
      level: w.level ?? '',
      example: w.example ?? '',
      exampleTranslation: w.exampleTranslation ?? '',
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

/** Minimal RFC4180-ish CSV parser: handles quoted fields with commas, quotes, newlines. */
export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += c; i++
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

export interface ParsedImportRow {
  line: number
  draft: WordDraft
}

export type ImportPreviewRow =
  | { kind: 'ok'; line: number; draft: WordDraft }
  | { kind: 'duplicate'; line: number; draft: WordDraft }
  | { kind: 'error'; line: number; message: string }

const STATUS_VALUES: WordStatus[] = ['new', 'learning', 'known']

function existingKey(lang: LangCode, headword: string): string {
  return `${lang}:${headword.trim().toLowerCase()}`
}

/**
 * Parse a CSV export (or a compatible file) into preview rows: `ok` rows are new and
 * importable, `duplicate` rows already exist (same lang + headword, case-insensitive)
 * either in the current wordlist or earlier in the same file, and `error` rows are
 * missing required fields. Header row must include at least `headword`; other columns
 * are matched by name against `CSV_COLUMNS` and are optional.
 */
export function parseImportCsv(text: string, existing: UserWord[]): ImportPreviewRow[] {
  const table = parseCsvTable(text.trim())
  if (table.length === 0) return []
  const header = table[0].map((h) => h.trim())
  const headwordIdx = header.indexOf('headword')
  if (headwordIdx === -1) {
    return [{ kind: 'error', line: 1, message: 'Thiếu cột "headword" trong file CSV.' }]
  }
  const idx = (name: string) => header.indexOf(name)

  const seen = new Set(existing.map((w) => existingKey(w.lang, w.headword)))
  const out: ImportPreviewRow[] = []

  for (let r = 1; r < table.length; r++) {
    const cols = table[r]
    const line = r + 1
    const headword = (cols[headwordIdx] ?? '').trim()
    if (!headword) { out.push({ kind: 'error', line, message: 'Thiếu từ (headword).' }); continue }

    const langRaw = (idx('lang') >= 0 ? cols[idx('lang')] : '')?.trim() || 'en'
    if (!isLangCode(langRaw)) {
      out.push({ kind: 'error', line, message: `Ngôn ngữ không hợp lệ: "${langRaw}".` })
      continue
    }
    const lang = langRaw as LangCode

    const statusRaw = (idx('status') >= 0 ? cols[idx('status')] : '')?.trim() || 'new'
    const status = (STATUS_VALUES as string[]).includes(statusRaw) ? (statusRaw as WordStatus) : 'new'

    const tagsRaw = idx('tags') >= 0 ? cols[idx('tags')] ?? '' : ''
    const tags = tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean)

    const field = (name: string) => {
      const i = idx(name)
      const v = i >= 0 ? (cols[i] ?? '').trim() : ''
      return v.length > 0 ? v : null
    }

    const draft: WordDraft = {
      lang,
      entryId: null,
      headword,
      reading: field('reading'),
      ipa: field('ipa'),
      pos: field('pos'),
      meaningVi: field('meaningVi'),
      meaningEn: field('meaningEn'),
      level: field('level'),
      example: field('example'),
      exampleTranslation: field('exampleTranslation'),
      audioUrl: null,
      notes: field('notes'),
      status,
      tags,
    }

    const key = existingKey(lang, headword)
    if (seen.has(key)) {
      out.push({ kind: 'duplicate', line, draft })
      continue
    }
    seen.add(key)
    out.push({ kind: 'ok', line, draft })
  }
  return out
}
