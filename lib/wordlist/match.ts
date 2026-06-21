export interface MatchWord {
  id: string
  headword: string
  meaningVi: string | null
}

export interface MatchTile {
  key: string
  wordId: string
  text: string
  kind: 'word' | 'meaning'
}

type Rand = () => number

function shuffle<T>(input: T[], rand: Rand): T[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Build the shuffled tile set for a matching round (Quizlet "Match"): each chosen
 * word yields a headword tile and a meaning tile; the player pairs them. Words with
 * no Vietnamese meaning are skipped. `rand` is injectable for deterministic tests.
 */
export function buildMatchTiles(words: MatchWord[], size: number, rand: Rand = Math.random): MatchTile[] {
  const usable = words.filter((w): w is MatchWord & { meaningVi: string } => Boolean(w.meaningVi && w.meaningVi.trim()))
  const chosen = shuffle(usable, rand).slice(0, size)
  const tiles: MatchTile[] = chosen.flatMap((w) => [
    { key: `w-${w.id}`, wordId: w.id, text: w.headword, kind: 'word' as const },
    { key: `m-${w.id}`, wordId: w.id, text: w.meaningVi, kind: 'meaning' as const },
  ])
  return shuffle(tiles, rand)
}
