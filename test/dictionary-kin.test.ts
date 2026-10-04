import { describe, it, expect } from 'vitest'
import { getWordKin } from '@/lib/dictionary/kin'
import { rpcClientReturning } from './helpers/supabase'

function row(headword: string, pos: string | null = 'verb') {
  return {
    id: `en:${headword}`, lang: 'en', headword, traditional: null, level: 'B1',
    frequency_rank: 100, attributes: null, pos, gloss_vi: 'nghĩa', gloss_en: null,
    ipa: null, audio_url: null, rank: 3,
  }
}

describe('getWordKin', () => {
  // The shape that left /dictionary/en/adjourned with nothing but two junk
  // comparatives: no relation rows at all, but four entries on the same stem.
  it('keeps the entries built on the stem', async () => {
    const { client } = rpcClientReturning([
      row('adjourn'), row('adjourning'), row('adjournment', 'noun'), row('adjourns'),
    ])
    const out = await getWordKin(client, 'en', 'adjourn', 'adjourned')
    expect(out.map((w) => w.headword)).toEqual(['adjourn', 'adjourning', 'adjournment', 'adjourns'])
  })

  // `lex.search` ranks fuzzy neighbours in too: "contact" comes back for
  // "contract", and it is not a word of the same family.
  it('drops a match that is not built on the stem', async () => {
    const { client } = rpcClientReturning([row('contracts'), row('contact'), row('contrary')])
    const out = await getWordKin(client, 'en', 'contract', 'contract')
    expect(out.map((w) => w.headword)).toEqual(['contracts'])
  })

  it('leaves out the word the learner is already reading', async () => {
    const { client } = rpcClientReturning([row('Adjourned'), row('adjourns')])
    const out = await getWordKin(client, 'en', 'adjourn', 'adjourned')
    expect(out.map((w) => w.headword)).toEqual(['adjourns'])
  })

  // go listed Goh, good and god; UN listed under, until and university.
  it('keeps only the inflections of a short stem, and no proper noun', async () => {
    const { client } = rpcClientReturning([row('goes'), row('Goh'), row('good'), row('god'), row('going'), row('gone'), row('goer')])
    const out = await getWordKin(client, 'en', 'go', 'go')
    expect(out.map((w) => w.headword)).toEqual(['goes', 'going', 'gone', 'goer'])
    const un = rpcClientReturning([row('under'), row('until')])
    await expect(getWordKin(un.client, 'en', 'UN', 'UN')).resolves.toEqual([])
  })

  it('caps the list so the section stays readable', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`adjourn${i}`))
    const { client } = rpcClientReturning(rows)
    await expect(getWordKin(client, 'en', 'adjourn', 'adjourned', 5)).resolves.toHaveLength(5)
  })

  it('does not ask at all for an empty stem', async () => {
    const { client, rpc } = rpcClientReturning([])
    await expect(getWordKin(client, 'en', '  ', 'x')).resolves.toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })
})
