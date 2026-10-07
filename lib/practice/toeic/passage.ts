import { tokenize } from '@/lib/reader/tokenize'
import type { ResolvedText } from '@/lib/dictionary/tappable'
import type { DictEntryPreview } from '@/lib/dictionary/types'
import type { ToeicGroup, ToeicQuestion } from './tests'

/** A run of a passage and where it starts in the passage, so a range found in the whole
 *  passage can be drawn inside it. */
export interface Piece { text: string; from: number }

export type Block =
  | { kind: 'text'; piece: Piece }
  | { kind: 'table'; rows: Piece[][] }
  | { kind: 'chat'; lines: { who: string; msg: Piece }[] }

export type Range = [number, number]

const CELL = ' | '

/** A passage as drawn: blank lines end a block, lines with " | " are table rows, lines with a
 *  tab are chat lines ("Name (9:42 A.M.)<TAB>message"), and other lines stay one paragraph. */
export function passageBlocks(text: string): Block[] {
  const blocks: Block[] = []
  /** The block the next line may join; a blank line closes it. */
  let open: Block | null = null
  let at = 0
  for (const line of text.split('\n')) {
    const from = at
    at += line.length + 1
    if (line.trim() === '') { open = null; continue }
    if (line.includes('\t')) {
      const tab = line.indexOf('\t')
      const entry = { who: line.slice(0, tab), msg: { text: line.slice(tab + 1), from: from + tab + 1 } }
      if (open?.kind === 'chat') open.lines.push(entry)
      else blocks.push(open = { kind: 'chat', lines: [entry] })
    } else if (line.includes(CELL)) {
      const cells: Piece[] = []
      let c = from
      for (const cell of line.split(CELL)) {
        cells.push({ text: cell, from: c })
        c += cell.length + CELL.length
      }
      if (open?.kind === 'table') open.rows.push(cells)
      else blocks.push(open = { kind: 'table', rows: [cells] })
    } else if (open?.kind === 'text') {
      open.piece = { text: text.slice(open.piece.from, from + line.length), from: open.piece.from }
    } else {
      blocks.push(open = { kind: 'text', piece: { text: line, from } })
    }
  }
  return blocks
}

/** `ranges` of the whole passage that fall inside `piece`, in the piece's own offsets. */
export function rangesIn(piece: Piece, ranges: readonly Range[]): Range[] {
  const end = piece.from + piece.text.length
  return ranges
    .filter(([a, b]) => a < end && b > piece.from)
    .map(([a, b]) => [Math.max(a, piece.from) - piece.from, Math.min(b, end) - piece.from])
}

/** The lines of `text` that hold `range`, for quoting the evidence on its own. */
export function linesAround(text: string, [a, b]: Range): Piece {
  const from = text.lastIndexOf('\n', a - 1) + 1
  const end = text.indexOf('\n', b)
  return { text: text.slice(from, end < 0 ? text.length : end), from }
}

/** Where `needle` sits among the group's passages, or null. */
function locate(group: ToeicGroup, needle: string): { passage: number; range: Range } | null {
  if (!needle) return null
  for (const [i, p] of group.passages.entries()) {
    const from = p.text.indexOf(needle)
    if (from >= 0) return { passage: i, range: [from, from + needle.length] }
  }
  return null
}

/** The passage text that proves the answer. Part 5 has none. */
export const evidenceAt = (group: ToeicGroup, q: ToeicQuestion) => locate(group, q.evidence)

/** A Part 6 gap, "(131) -------". */
export const gapAt = (group: ToeicGroup, number: number) => locate(group, `(${number}) -------`)

/** Every text of a test that a learner can tap a word in. */
export function tappableTexts(groups: readonly ToeicGroup[]): string[] {
  return groups.flatMap((g) => [
    ...g.passages.map((p) => p.text),
    ...g.questions.flatMap((q) => [q.stem, ...q.options]),
  ])
}

/** One word as a page sends it: the lowercased token, then the entry fields the popover
 *  shows and a save writes. A tuple, not an object: the keys of 1,568 entries were a third of
 *  test01's payload. */
export type PackedWord = [
  token: string, id: string, headword: string, ipa: string | null, pos: string | null,
  glossVi: string | null, glossEn: string | null, level: string | null, audioUrl: string | null,
]

/** The entries of every resolved text, each token once. */
export function packWords(resolved: readonly ResolvedText[]): PackedWord[] {
  const words = new Map<string, PackedWord>()
  for (const r of resolved) {
    for (const [token, e] of r.entries) {
      words.set(token, [token, e.id, e.headword, e.ipa, e.pos, e.glossVi, e.glossEn, e.level, e.audioUrl])
    }
  }
  return [...words.values()]
}

export function unpackWords(packed: readonly PackedWord[]): Map<string, DictEntryPreview> {
  return new Map(packed.map(([token, id, headword, ipa, pos, glossVi, glossEn, level, audioUrl]) => [
    token,
    { id, lang: 'en', headword, traditional: null, level, ipa, pos, glossVi, glossEn, audioUrl },
  ]))
}

/** One text as `TappableText` takes it, rebuilt from the merged words. English needs no
 *  headword list to tokenise, so the segments match the server's. */
export function resolveFromWords(words: ReadonlyMap<string, DictEntryPreview>, text: string): ResolvedText {
  const segments = tokenize('en', text)
  const tokens = new Set(segments.filter((s) => s.word).map((s) => s.text.toLowerCase()))
  return {
    text,
    segments,
    entries: [...tokens].flatMap((t): [string, DictEntryPreview][] => {
      const entry = words.get(t)
      return entry ? [[t, entry]] : []
    }),
    chars: [],
  }
}
