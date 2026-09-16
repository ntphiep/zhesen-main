/**
 * `decodeURIComponent` that hands the input back instead of throwing.
 *
 * Two callers, one reason. A dynamic route segment reaches the page still
 * percent-encoded when it is not ASCII: measured on Next 16.3.5 with
 * `next start`, `/dictionary/en/dog` arrives as `dog` while
 * `/dictionary/zh/%E7%8B%97` arrives encoded, so a page that skipped the decode
 * answered 404 for every Chinese entry. A stored `audio_url` is the other.
 *
 * Both inputs can be malformed. `'%'` alone is not valid percent-encoding and
 * `decodeURIComponent` throws `URIError` on it, which turned a wrong address into
 * a 500 instead of a 404 and lost a whole result list to one bad row. A value
 * that cannot be decoded is passed through: it will simply match nothing.
 *
 * Decoding a value Next already decoded is safe for this data. Counted over all
 * 36,361 rows of `lex.entries`, no headword contains `%`, `#`, `?`, `&` or `+`,
 * so there is nothing for a second pass to corrupt.
 */
export function percentDecode(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
