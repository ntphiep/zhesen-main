import { shuffle, type Rand } from './shuffle'
import { meaningKey } from './quiz'

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
 * no Vietnamese meaning are skipped, and so is a second word with the same meaning, which
 * would make the pairing a guess. `rand` is injectable for deterministic tests.
 */
export function buildMatchTiles(words: MatchWord[], size: number, rand: Rand = Math.random): MatchTile[] {
  const usable = words.filter((w): w is MatchWord & { meaningVi: string } => Boolean(w.meaningVi && w.meaningVi.trim()))
  const chosen = shuffle(usable, rand)
    .filter((w, i, arr) => arr.findIndex((o) => meaningKey(o.meaningVi) === meaningKey(w.meaningVi)) === i)
    .slice(0, size)
  const tiles: MatchTile[] = chosen.flatMap((w) => [
    { key: `w-${w.id}`, wordId: w.id, text: w.headword, kind: 'word' as const },
    { key: `m-${w.id}`, wordId: w.id, text: w.meaningVi, kind: 'meaning' as const },
  ])
  return shuffle(tiles, rand)
}
