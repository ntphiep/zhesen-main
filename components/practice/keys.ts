/** The key a practice shortcut may act on, or null when the press belongs to something
 *  else: a field being typed in, a chord, or Space and Enter on a control that already
 *  answers them itself. */
export function onlyKey(e: KeyboardEvent): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null
  const t = e.target instanceof Element ? e.target : null
  if (t?.closest('input, textarea, select, [contenteditable="true"]')) return null
  if ((e.key === ' ' || e.key === 'Enter') && t?.closest('button, a, summary')) return null
  return e.key
}
