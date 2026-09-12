/** A source of numbers in [0, 1). Injectable so a round can be made deterministic
 * in a test; defaults to Math.random everywhere it is used. */
export type Rand = () => number

/** A shuffled copy, Fisher-Yates. The input is not touched. */
export function shuffle<T>(input: T[], rand: Rand = Math.random): T[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
