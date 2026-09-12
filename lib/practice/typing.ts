export type TypedResult = 'correct' | 'close' | 'wrong'

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop combining diacritics (café -> cafe)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/**
 * Grade a typed answer against the expected word. Case-, space- and diacritic-
 * insensitive. A single-character typo on a word of 4+ letters counts as "close"
 * (shown as almost-right), shorter words must match exactly.
 */
export function checkTypedAnswer(input: string, expected: string): TypedResult {
  const a = normalize(input)
  const b = normalize(expected)
  if (!a) return 'wrong'
  if (a === b) return 'correct'
  if (b.length >= 4 && levenshtein(a, b) <= 1) return 'close'
  return 'wrong'
}
