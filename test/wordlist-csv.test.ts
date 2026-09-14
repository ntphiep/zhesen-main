import { describe, it, expect } from 'vitest'
import { wordsToCsv, wordsToAnkiTsv, parseCsvTable, parseImportCsv } from '@/lib/wordlist/csv'
import type { UserWord } from '@/lib/wordlist/types'

function mk(over: Partial<UserWord> = {}): UserWord {
  return {
    id: '1', lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: '/dɔːɡ/', pos: 'noun',
    meaningVi: 'con chó', meaningEn: 'dog', level: 'A1', example: 'The dog barked.', exampleTranslation: 'Con chó sủa.',
    audioUrl: null, notes: null, status: 'new', tags: ['animal'], createdAt: '2026-06-19T00:00:00Z', updatedAt: 'x', fsrsDueAt: '2026-01-01T00:00:00Z', fsrsLapses: 0,
    ...over,
  }
}

describe('wordsToCsv', () => {
  it('emits a header row and one row per word', () => {
    const csv = wordsToCsv([mk()])
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('headword,lang,entryId,reading,ipa,pos,meaningVi,meaningEn,level,example,exampleTranslation,audioUrl,notes,status,tags,createdAt')
    expect(lines[1]).toContain('dog')
    expect(lines[1]).toContain('animal')
  })

  it('quotes fields containing commas', () => {
    const csv = wordsToCsv([mk({ example: 'Hello, world.' })])
    expect(csv).toContain('"Hello, world."')
  })

  it('round-trips through parseCsvTable', () => {
    const csv = wordsToCsv([mk({ headword: 'a"b', example: 'x, y' })])
    const table = parseCsvTable(csv)
    expect(table[1][0]).toBe('a"b')
    expect(table[1][9]).toBe('x, y')
  })
})

describe('wordsToAnkiTsv', () => {
  it('emits front, back, tags separated by tabs', () => {
    const tsv = wordsToAnkiTsv([mk()])
    const [front, back, tags] = tsv.trim().split('\t')
    expect(front).toContain('dog')
    expect(back).toContain('con chó')
    expect(tags).toBe('animal')
  })

  it('strips tabs and newlines from fields so the row stays exactly 3 tab-separated fields', () => {
    const tsv = wordsToAnkiTsv([mk({ example: 'line1\nline2\ttabbed' })])
    const [, back] = tsv.trim().split('\t')
    expect(tsv.trim().split('\t')).toHaveLength(3)
    expect(back).toContain('line1 line2 tabbed')
  })
})

describe('parseImportCsv', () => {
  const header = 'headword,lang,meaningVi,status,tags\n'

  // The export exists so a wordlist survives cleared cookies. A restored word that
  // lost its entry id is a different, poorer word: WordDetail falls back to the bare
  // stored fields and playback falls back to speech synthesis.
  it('restores the dictionary link and the audio url when re-importing an export', () => {
    const word = mk({ entryId: 'en:dog', audioUrl: 'https://example.org/dog.ogg' })
    const rows = parseImportCsv(wordsToCsv([word]), [])
    expect(rows[0]).toMatchObject({
      kind: 'ok',
      draft: { entryId: 'en:dog', audioUrl: 'https://example.org/dog.ogg' },
    })
  })

  // An entry id from an unrelated file would break the foreign key on user_words,
  // and the insert is one statement for the whole import.
  it('drops an entry id that does not belong to the row language', () => {
    const rows = parseImportCsv('headword,lang,entryId\ncasa,es,en:dog\n', [])
    expect(rows[0]).toMatchObject({ kind: 'ok', draft: { entryId: null, headword: 'casa' } })
  })

  it('parses a new row as ok', () => {
    const rows = parseImportCsv(header + 'cat,en,con mèo,new,animal;pet', [])
    expect(rows).toEqual([{ kind: 'ok', line: 2, draft: expect.objectContaining({ headword: 'cat', lang: 'en', meaningVi: 'con mèo', tags: ['animal', 'pet'] }) }])
  })

  it('flags a row as duplicate when it matches an existing word (case-insensitive)', () => {
    const existing = [mk({ headword: 'Cat', lang: 'en' })]
    const rows = parseImportCsv(header + 'cat,en,con mèo,new,', existing)
    expect(rows[0].kind).toBe('duplicate')
  })

  it('flags duplicates within the same file', () => {
    const rows = parseImportCsv(header + 'cat,en,,new,\ncat,en,,new,', [])
    expect(rows[0].kind).toBe('ok')
    expect(rows[1].kind).toBe('duplicate')
  })

  it('errors on missing headword', () => {
    const rows = parseImportCsv(header + ',en,,new,', [])
    expect(rows[0]).toMatchObject({ kind: 'error' })
  })

  it('errors on invalid lang', () => {
    const rows = parseImportCsv(header + 'cat,fr,,new,', [])
    expect(rows[0]).toMatchObject({ kind: 'error' })
  })

  it('errors when the file has no headword column', () => {
    const rows = parseImportCsv('foo,bar\n1,2', [])
    expect(rows).toEqual([{ kind: 'error', line: 1, message: expect.stringContaining('headword') }])
  })

  it('defaults missing status to "new"', () => {
    const rows = parseImportCsv('headword,lang\ncat,en', [])
    expect(rows[0]).toMatchObject({ kind: 'ok', draft: expect.objectContaining({ status: 'new' }) })
  })

  it('returns an empty list for empty input', () => {
    expect(parseImportCsv('', [])).toEqual([])
  })

  // A note typed across two lines in a spreadsheet is saved with CRLF. The CR
  // stayed inside the quoted field and travelled to the database with the note.
  it('does not carry a Windows line ending into a quoted field', () => {
    const csv = [
      'headword,lang,entryId,reading,ipa,pos,meaningVi,meaningEn,level,example,exampleTranslation,audioUrl,notes,status,tags,createdAt',
      'dog,en,,,,,con chó,,,,,,"dòng một\r\ndòng hai",new,,',
    ].join('\r\n')

    const rows = parseImportCsv(csv, [])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('ok')
    const notes = rows[0].kind === 'ok' ? rows[0].draft.notes : null
    expect(notes).toBe('dòng một\ndòng hai')
    expect(notes).not.toContain('\r')
  })
})
