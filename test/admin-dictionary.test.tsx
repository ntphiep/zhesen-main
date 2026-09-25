import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { getDictionary, parseDictionary } from '@/lib/admin/dictionary'
import { TableDetail, TableIndex, purpose } from '@/components/admin/DataDictionary'
import { rpcClientReturning } from './helpers/supabase'

/** The shape `admin.dictionary()` returned in a rolled-back dry run on production, trimmed. */
const col = (name: string, over: Partial<Record<string, unknown>> = {}) => ({
  name, type: 'text', nullable: false, default: null, generated: false, identity: false,
  primary_key: false, comment: `About ${name}.`, ...over,
})
const PAYLOAD = {
  schemas: [{ name: 'lex', comment: 'zhesen: dictionary content.' }],
  tables: [
    {
      schema: 'lex', name: 'entries', comment: 'zhesen: one headword in one language.', rows: 36361, bytes: 30515200, rls: true,
      columns: [col('id', { primary_key: true }), col('lang'), col('pinyin_toneless', { nullable: true, generated: true })],
      foreign_keys: [{ columns: ['lang'], ref_schema: 'public', ref_table: 'languages', ref_columns: ['code'], on_delete: 'no action' }],
      indexes: [{ name: 'entries_pkey', definition: 'CREATE UNIQUE INDEX entries_pkey ON lex.entries USING btree (id)', bytes: 1400000 }],
    },
    {
      schema: 'lex', name: 'senses', comment: 'zhesen: the meanings of an entry.', rows: 183526, bytes: 79937536, rls: true,
      columns: [col('id', { primary_key: true }), col('entry_id')],
      foreign_keys: [{ columns: ['entry_id'], ref_schema: 'lex', ref_table: 'entries', ref_columns: ['id'], on_delete: 'cascade' }],
      indexes: [],
    },
  ],
}

describe('parseDictionary', () => {
  it('attaches each single-column foreign key to its column and mirrors it on the other table', () => {
    const d = parseDictionary(PAYLOAD)
    const senses = d.tables.find((t) => t.id === 'lex.senses')!
    expect(senses.columns[1].references).toEqual({ table: 'lex.entries', column: 'id', onDelete: 'cascade' })
    const entries = d.tables.find((t) => t.id === 'lex.entries')!
    expect(entries.referencedBy).toEqual([{ table: 'lex.senses', columns: ['entry_id'], refColumns: ['id'], onDelete: 'cascade' }])
  })

  it('refuses a payload whose shape changed rather than drawing blanks', () => {
    expect(() => parseDictionary({ ...PAYLOAD, tables: [{ ...PAYLOAD.tables[0], rows: '36361' }] })).toThrow()
  })
})

describe('getDictionary', () => {
  it('calls admin.dictionary through the admin schema', async () => {
    const { client, rpc } = rpcClientReturning(PAYLOAD)
    await getDictionary(client)
    expect(client.schema).toHaveBeenCalledWith('admin')
    expect(rpc).toHaveBeenCalledWith('dictionary')
  })
})

describe('TableIndex', () => {
  it('lists each table with its purpose and exact row count', () => {
    render(<TableIndex dict={parseDictionary(PAYLOAD)} />)
    const row = screen.getByRole('button', { name: /senses/ }).closest('tr')!
    expect(row).toHaveTextContent('The meanings of an entry.')
    expect(row).toHaveTextContent('183,526')
    expect(screen.getByText('2 tables')).toBeInTheDocument()
  })

  it('opens a row in place to its columns and a link to its detail, and closes it again', () => {
    render(<TableIndex dict={parseDictionary(PAYLOAD)} />)
    const toggle = screen.getByRole('button', { name: /senses/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('About entry_id.')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toHaveTextContent('entry_id')
    expect(screen.getByText('About entry_id.')).toBeInTheDocument()
    expect(screen.getByText('FK')).toHaveAttribute('title', 'lex.entries.id')
    expect(screen.getByRole('link', { name: 'Open table' })).toHaveAttribute('href', '/admin/database?table=lex.senses')
    fireEvent.click(toggle)
    expect(screen.queryByText('About entry_id.')).toBeNull()
  })

  it('links each box of the diagram to its table, but not a table outside the project', () => {
    render(<TableIndex dict={parseDictionary(PAYLOAD)} />)
    expect(screen.getByRole('link', { name: 'lex.senses' })).toHaveAttribute('href', '/admin/database?table=lex.senses')
    expect(screen.queryByRole('link', { name: 'public.languages' })).toBeNull()
    expect(screen.getByText('public.languages')).toBeInTheDocument()
  })
})

describe('TableDetail', () => {
  it('explains every column and says what a delete does to the rows pointing here', () => {
    const d = parseDictionary(PAYLOAD)
    render(<TableDetail t={d.tables[1]} />)
    expect(screen.getByText('About entry_id.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'lex.entries.id' })).toHaveAttribute('href', '/admin/database?table=lex.entries')
    expect(screen.getByRole('link', { name: 'lex.entries.id' }).parentElement).toHaveTextContent('on delete cascade')
  })

  // /admin/database?table= answers 404 for a table outside lex, public and admin.
  it('names a Supabase table such as auth.users without linking to a page that does not exist', () => {
    const d = parseDictionary({ ...PAYLOAD, tables: [{
      ...PAYLOAD.tables[1], schema: 'public', name: 'user_words',
      foreign_keys: [{ columns: ['entry_id'], ref_schema: 'auth', ref_table: 'users', ref_columns: ['id'], on_delete: 'cascade' }],
    }] })
    render(<TableDetail t={d.tables[0]} />)
    expect(screen.getByText('auth.users.id').closest('a')).toBeNull()
    expect(screen.getByText('auth.users').closest('a')).toBeNull()
  })

  // pg_relation_size reads 0 for a PGroonga index; its data lives in Groonga's own files.
  it('does not show a PGroonga index as 0 B', () => {
    const d = parseDictionary({ ...PAYLOAD, tables: [{ ...PAYLOAD.tables[0], indexes: [{
      name: 'idx_lex_entries_headword_pgroonga', definition: 'CREATE INDEX idx_lex_entries_headword_pgroonga ON lex.entries USING pgroonga (headword)', bytes: 0,
    }] }] })
    render(<TableDetail t={d.tables[0]} />)
    expect(screen.queryByText('0 B')).toBeNull()
    expect(screen.getByText('stored outside Postgres')).toBeInTheDocument()
  })

  it('marks the key and the generated columns', () => {
    render(<TableDetail t={parseDictionary(PAYLOAD).tables[0]} />)
    expect(screen.getByText('PK')).toBeInTheDocument()
    expect(screen.getByText('generated')).toBeInTheDocument()
    expect(screen.getByText('Referenced by').parentElement).toHaveTextContent('lex.senses')
  })

  it('drops the ownership prefix from a comment', () => {
    expect(purpose('zhesen: dictionary content.')).toBe('Dictionary content.')
    expect(purpose(null)).toBe('No description.')
  })
})
