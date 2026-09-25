export interface IpaToken {
  text: string
  /** The phoneme this piece is, when the theory pages document one. */
  symbol: string | null
}

/**
 * Split a transcription into the phonemes documented on the pronunciation page, so each
 * one can link to its own entry. Longest symbol first, or `tʃ` reads as `t` then `ʃ` and
 * `iː` as `i` then a stray length mark. Anything outside the set, the slashes, the stress
 * marks and the syllable dot, comes back as plain text.
 */
export function splitIpa(value: string, symbols: readonly string[]): IpaToken[] {
  const ordered = [...symbols].sort((a, b) => b.length - a.length)
  const out: IpaToken[] = []
  let plain = ''

  for (let i = 0; i < value.length; ) {
    const hit = ordered.find((s) => value.startsWith(s, i))
    if (hit) {
      if (plain) { out.push({ text: plain, symbol: null }); plain = '' }
      out.push({ text: hit, symbol: hit })
      i += hit.length
    } else {
      plain += value[i]
      i += 1
    }
  }
  if (plain) out.push({ text: plain, symbol: null })
  return out
}
