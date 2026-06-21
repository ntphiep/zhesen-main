/** Prepend a query to the recent-searches list: trimmed, deduped case-insensitively
 * (newest casing wins), most-recent first, capped at `max`. Returns a new array. */
export function pushRecent(list: string[], query: string, max = 8): string[] {
  const q = query.trim()
  if (!q) return list
  const rest = list.filter((x) => x.toLowerCase() !== q.toLowerCase())
  return [q, ...rest].slice(0, max)
}
