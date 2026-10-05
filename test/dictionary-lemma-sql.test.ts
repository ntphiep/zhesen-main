import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { POINTER_WORDS, INFLECTION_WORDS } from '@/lib/dictionary/lemma'

// lex.pointer_lemma repeats lemmaFromSenses in SQL so the level lists can leave forms out.
// A word added on one side only makes the word page and the level list disagree.
// The latest migration that defines it is the one production runs.
const dir = join(__dirname, '..', 'supabase', 'migrations')
const latest = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .filter((f) => readFileSync(join(dir, f), 'utf8').includes('function lex.pointer_lemma')).at(-1)
const sql = readFileSync(join(dir, latest ?? ''), 'utf8')
// Adjacent string literals separated by a newline are one literal in Postgres.
const joined = sql.replace(/'\s*\n\s*'/g, '')

describe('lex.pointer_lemma word lists', () => {
  it('uses the pointer words of lemmaFromSenses', () => {
    const m = joined.match(/\^\(\(\?:\(\?:([a-z|-]+)\|\\\(/)
    expect(m).not.toBeNull()
    expect(m![1].split('|').sort()).toEqual([...POINTER_WORDS].sort())
  })

  it('uses the inflection words of lemmaFromSenses', () => {
    const m = joined.match(/\\m\(([a-z|]+)\)\\M/)
    expect(m).not.toBeNull()
    expect(m![1].split('|').sort()).toEqual([...INFLECTION_WORDS].sort())
  })
})
