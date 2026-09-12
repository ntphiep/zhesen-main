/**
 * The grammatical gender of a Spanish word, in Vietnamese.
 *
 * `lex.entries.attributes` carries `gender` on 7,079 of the 11,312 Spanish
 * entries, and nothing in the app showed it. A Spanish noun cannot be used
 * without it -- the article, the adjective and the pronoun all agree with it --
 * so learning "perro" without learning that it is masculine is learning half the
 * word. Every bilingual dictionary marks it (WordReference writes `nm`/`nf`
 * beside the gloss); the Vietnamese words are spelled out here rather than
 * abbreviated, since a learner reading a Vietnamese interface has no reason to
 * know what `nm` stands for.
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
