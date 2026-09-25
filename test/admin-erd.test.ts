import { describe, it, expect } from 'vitest'
import { parseDictionary } from '@/lib/admin/dictionary'
import { BOX_H, BOX_W, layoutErd } from '@/lib/admin/erd'

const col = (name: string) => ({
  name, type: 'text', nullable: false, default: null, generated: false, identity: false, primary_key: name === 'id', comment: null,
})
const fk = (columns: string[], ref: string, refColumns = ['id']) => {
  const [ref_schema, ref_table] = ref.split('.')
  return { columns, ref_schema, ref_table, ref_columns: refColumns, on_delete: 'cascade' as const }
}
const table = (id: string, fks: ReturnType<typeof fk>[] = []) => {
  const [schema, name] = id.split('.')
  return { schema, name, comment: null, rows: 10, bytes: 8192, rls: true, columns: [col('id')], foreign_keys: fks, indexes: [] }
}

/** The shape of lex on production, trimmed: sources and entries at the root, senses under entries. */
const DICT = parseDictionary({
  schemas: [],
  tables: [
    table('lex.sources'),
    table('lex.entries', [fk(['source_id'], 'lex.sources'), fk(['lang'], 'public.languages', ['code'])]),
    table('lex.senses', [fk(['entry_id'], 'lex.entries'), fk(['source_id'], 'lex.sources')]),
    table('lex.examples', [fk(['sense_id'], 'lex.senses'), fk(['entry_id'], 'lex.entries')]),
    table('lex.lex_relations', [fk(['from_id'], 'lex.entries'), fk(['to_id'], 'lex.entries')]),
    table('lex.tree', [fk(['parent_id'], 'lex.tree')]),
    table('public.user_words', [fk(['user_id'], 'auth.users'), fk(['entry_id'], 'lex.entries')]),
  ],
})

describe('layoutErd', () => {
  const erd = layoutErd(DICT.tables, 'lex')
  const box = (id: string) => erd.boxes.find((b) => b.id === id)!

  it('ranks a table one past the deepest table it references', () => {
    expect(box('lex.sources').rank).toBe(0)
    expect(box('lex.entries').rank).toBe(1)
    expect(box('lex.senses').rank).toBe(2)
    expect(box('lex.examples').rank).toBe(3)
    expect(box('lex.tree').rank).toBe(0)
  })

  it('draws one edge per foreign key, parallel keys and self references included', () => {
    const fks = DICT.tables.filter((t) => t.schema === 'lex').reduce((n, t) => n + t.references.length, 0)
    expect(erd.edges).toHaveLength(fks)
    expect(erd.edges.filter((e) => e.from === 'lex.lex_relations' && e.to === 'lex.entries')).toHaveLength(2)
    expect(erd.edges.find((e) => e.from === 'lex.tree')?.to).toBe('lex.tree')
  })

  it('draws a table outside the schema it references as an external box, and leaves out tables of other schemas', () => {
    expect(box('public.languages')).toMatchObject({ external: true, rank: 0, rows: null })
    expect(erd.boxes.some((b) => b.id === 'public.user_words' || b.id === 'auth.users')).toBe(false)
    expect(layoutErd(DICT.tables, 'public').boxes.filter((b) => b.external).map((b) => b.id)).toEqual(['auth.users', 'lex.entries'])
  })

  it('keeps every box inside the drawing and none on top of another', () => {
    for (const b of erd.boxes) {
      expect(b.x + BOX_W).toBeLessThanOrEqual(erd.width)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.y + BOX_H).toBeLessThanOrEqual(erd.height)
    }
    const spots = erd.boxes.map((b) => `${b.x}:${b.y}`)
    expect(new Set(spots).size).toBe(spots.length)
  })

  it('starts each edge on the table holding the key and ends it on the referenced one', () => {
    const e = erd.edges.find((x) => x.from === 'lex.senses' && x.to === 'lex.entries')!
    const [x1, , , , , , x2] = e.d.replace(/[MC,]/g, ' ').trim().split(/\s+/).map(Number)
    expect(x1).toBe(box('lex.senses').x)
    expect(x2).toBe(box('lex.entries').x + BOX_W)
  })
})
