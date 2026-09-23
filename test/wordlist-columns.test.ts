import { describe, it, expect } from 'vitest'
import {
  COLUMNS, DEFAULT_PREFS, MAX_PINNED, columnValue, isVisible, orderedColumns,
  parseColumnPrefs, serializeColumnPrefs, toggleHidden, togglePinned, type ColumnPrefs,
} from '@/lib/wordlist/columns'
import type { UserWord } from '@/lib/wordlist/types'

function mk(over: Partial<UserWord> = {}): UserWord {
  return {
    id: 'id', lang: 'en', entryId: null, headword: 'dog', reading: null, ipa: null, pos: null,
    meaningVi: null, meaningEn: null, level: null, example: null, exampleTranslation: null,
    audioUrl: null, notes: null, status: 'new', tags: [], createdAt: '2026-01-01T00:00:00Z',
    updatedAt: 'x', fsrsDueAt: '2026-01-01T00:00:00Z', fsrsLapses: 0,
    ...over,
  }
}

describe('column preferences', () => {
  it('starts with the columns a learner sees today', () => {
    const shown = orderedColumns(DEFAULT_PREFS).map((c) => c.key)
    expect(shown).toEqual(['headword', 'ipa', 'pos', 'meaningVi', 'level', 'tags', 'createdAt', 'audio'])
  })

  it('puts pinned columns first, each in the declared order', () => {
    const prefs: ColumnPrefs = { hidden: [], pinned: ['level', 'ipa'] }
    const keys = orderedColumns(prefs).map((c) => c.key)
    expect(keys.slice(0, 2)).toEqual(['ipa', 'level'])
    expect(keys).toHaveLength(COLUMNS.length)
  })

  it('hides a column and shows it again', () => {
    let prefs = toggleHidden(DEFAULT_PREFS, 'ipa')
    expect(isVisible(prefs, 'ipa')).toBe(false)
    prefs = toggleHidden(prefs, 'ipa')
    expect(isVisible(prefs, 'ipa')).toBe(true)
  })

  // A row of attributes with no word in it tells the reader nothing.
  it('refuses to hide the word itself', () => {
    const prefs = toggleHidden(DEFAULT_PREFS, 'headword')
    expect(prefs).toBe(DEFAULT_PREFS)
    expect(isVisible(prefs, 'headword')).toBe(true)
  })

  it('unpins a column when it is hidden, because nothing can stick to the edge unseen', () => {
    const pinned = togglePinned(DEFAULT_PREFS, 'ipa')
    expect(pinned.pinned).toContain('ipa')
    const hidden = toggleHidden(pinned, 'ipa')
    expect(hidden.pinned).not.toContain('ipa')
  })

  it('shows a hidden column when it is pinned, because an invisible pin changes nothing', () => {
    const prefs = togglePinned(DEFAULT_PREFS, 'notes')
    expect(prefs.pinned).toContain('notes')
    expect(isVisible(prefs, 'notes')).toBe(true)
  })

  it('reads preferences back, and falls back rather than trusting damaged storage', () => {
    expect(parseColumnPrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parseColumnPrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parseColumnPrefs('{"hidden":["ipa"],"pinned":["headword"]}'))
      .toEqual({ hidden: ['ipa'], pinned: ['headword'] })
  })

  // The value survives releases. A column dropped in a later version must not take the
  // table with it, and a stored "headword" in `hidden` must not blank the word column.
  it('drops keys it does not recognise, and refuses to hide a required column', () => {
    const prefs = parseColumnPrefs('{"hidden":["ipa","gone","headword",7],"pinned":["nope"]}')
    expect(prefs).toEqual({ hidden: ['ipa'], pinned: [] })
  })

  // A column shipped later cannot be named in a value written before it existed, so
  // without this it would appear on its own in every browser that ever opened the menu.
  it('gives a column the reader has never seen its own default', () => {
    const written = serializeColumnPrefs({ hidden: ['ipa'], pinned: ['headword'] })
    // As if 'notes' and 'example' were added in a later release.
    const older = JSON.stringify({
      ...JSON.parse(written),
      known: COLUMNS.map((c) => c.key).filter((k) => k !== 'notes' && k !== 'example'),
    })
    const prefs = parseColumnPrefs(older)
    expect(prefs.hidden).toContain('notes')
    expect(prefs.hidden).toContain('example')
    expect(prefs.hidden).toContain('ipa')
    expect(prefs.pinned).toEqual(['headword'])
  })

  it('keeps every choice in a value written round-trip', () => {
    const prefs: ColumnPrefs = { hidden: ['ipa', 'tags'], pinned: ['headword', 'meaningVi'] }
    expect(parseColumnPrefs(serializeColumnPrefs(prefs))).toEqual(prefs)
  })

  // Any of these would otherwise leave the table with every column shown and the word
  // column unpinned.
  it('falls back to the defaults for a damaged value of any shape', () => {
    expect(parseColumnPrefs('not json')).toEqual(DEFAULT_PREFS)
    expect(parseColumnPrefs('null')).toEqual(DEFAULT_PREFS)
    expect(parseColumnPrefs('[]')).toEqual(DEFAULT_PREFS)
    expect(parseColumnPrefs('["headword"]')).toEqual(DEFAULT_PREFS)
  })

  // Every pinned column holds 160px that never scrolls, so a phone runs out of room
  // for the columns that do.
  it('pins no more columns than fit beside the scrolling ones', () => {
    let prefs: ColumnPrefs = { hidden: [], pinned: [] }
    for (const key of ['headword', 'lang', 'ipa', 'pos'] as const) prefs = togglePinned(prefs, key)
    expect(prefs.pinned).toEqual(['headword', 'lang', 'ipa'])
    expect(prefs.pinned).toHaveLength(MAX_PINNED)

    // Room again once one is released.
    prefs = togglePinned(prefs, 'lang')
    expect(togglePinned(prefs, 'pos').pinned).toEqual(['headword', 'ipa', 'pos'])
  })

  it('cuts a stored list that pins more than the table can hold', () => {
    const prefs = parseColumnPrefs('{"hidden":[],"pinned":["headword","lang","ipa","pos","level"]}')
    expect(prefs.pinned).toEqual(['headword', 'lang', 'ipa'])
  })
})

describe('columnValue', () => {
  it('reads the field a column sorts on', () => {
    expect(columnValue(mk({ level: 'B1' }), 'level')).toBe('B1')
    expect(columnValue(mk({ tags: ['toeic', 'part5'] }), 'tags')).toBe('part5, toeic')
    expect(columnValue(mk({ fsrsLapses: 4 }), 'fsrsLapses')).toBe(4)
  })

  // The stored order is whatever an import or the last edit left, and it must not decide
  // where a word lands under "Thẻ".
  it('gives two words carrying the same tags the same place in the order', () => {
    expect(columnValue(mk({ tags: ['toeic', 'part5'] }), 'tags'))
      .toBe(columnValue(mk({ tags: ['part5', 'toeic'] }), 'tags'))
  })

  it('answers an empty string for a field with nothing in it, which sorts it last', () => {
    expect(columnValue(mk(), 'level')).toBe('')
    expect(columnValue(mk(), 'meaningVi')).toBe('')
  })

  // New, then learning, then known: the order a learner moves through.
  it('orders a status by progress rather than alphabetically', () => {
    expect(columnValue(mk({ status: 'new' }), 'status')).toBe(0)
    expect(columnValue(mk({ status: 'learning' }), 'status')).toBe(1)
    expect(columnValue(mk({ status: 'known' }), 'status')).toBe(2)
  })
})
