/**
 * Which example sentences a public page may show. The owner decided on 2026-10-05 that a
 * sentence from a source without an open licence is not shown, and the data stays: in
 * `lex.sources` that is a licence left empty (glosbe, cambridge-vi) or "proprietary"
 * (cambridge). The licence column decides, so a source recorded later needs no code change.
 */
export function isOpenLicence(license: string | null | undefined): boolean {
  const l = license?.trim() ?? ''
  return l !== '' && l.toLowerCase() !== 'proprietary'
}
