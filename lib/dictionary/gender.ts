/**
 * The grammatical gender of a Spanish word, in Vietnamese. `lex.entries.attributes` carries
 * `gender` on 7,079 of the 11,312 Spanish entries. Spelled out rather than abbreviated to
 * `nm`/`nf`: a learner reading a Vietnamese interface has no reason to know those.
 */
export function genderLabel(attributes: Record<string, unknown> | null | undefined): string | null {
  return genderFromCode(typeof attributes?.gender === 'string' ? attributes.gender : null)
}

export function genderFromCode(code: string | null | undefined): string | null {
  switch (code?.trim().toLowerCase()) {
    case 'm':
    case 'masculine':
      return 'giống đực'
    case 'f':
    case 'feminine':
      return 'giống cái'
    // Words like "el/la estudiante" carry both.
    case 'mf':
    case 'fm':
      return 'giống đực/cái'
    default:
      return null
  }
}
