import { shuffle, type Rand } from './shuffle'

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
