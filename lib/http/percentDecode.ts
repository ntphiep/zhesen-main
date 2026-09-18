/**
 * `decodeURIComponent` that hands the input back instead of throwing on a lone `%`.
 * Non-ASCII route segments arrive still encoded (Next 16.3.5 under `next start`:
 * `/dictionary/zh/%E7%8B%97`), so skipping the decode 404s every Chinese entry. Decoding an
 * already-decoded value is safe here: across all 36,361 `lex.entries` rows, no headword
 * contains `%`, `#`, `?`, `&` or `+`.
 */
export function percentDecode(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
