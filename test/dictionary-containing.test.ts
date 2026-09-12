import { describe, it, expect } from 'vitest'
import { getEntriesContaining } from '@/lib/dictionary/containing'
import { rpcClientReturning } from './helpers/supabase'

const row = (headword: string) => ({
  id: `zh:${headword}`, lang: 'zh', headword, traditional: null,
  level: null, frequency_rank: 10, gloss_vi: 'nghĩa', gloss_en: null,
})

const mockClient = rpcClientReturning

describe('getEntriesContaining', () => {
  it('maps the rows to the camelCase shape the page renders', async () => {
    const { client } = mockClient([row('学生'), row('大学')])
    const out = await getEntriesContaining(client, 'zh', '学')
    expect(out.map((w) => w.headword)).toEqual(['学生', '大学'])
    expect(out[0]).toMatchObject({ id: 'zh:学生', lang: 'zh', glossVi: 'nghĩa', glossEn: null })
  })

  it('asks the database for the language and word it was given', async () => {
    const { client, rpc } = mockClient([])
    await getEntriesContaining(client, 'en', '  give  ', 5)
    expect(rpc).toHaveBeenCalledWith('entries_containing', { p_lang: 'en', p_text: 'give', p_limit: 5 })
  })

  it('does not ask at all for an empty word', async () => {
    const { client, rpc } = mockClient([])
    await expect(getEntriesContaining(client, 'zh', '   ')).resolves.toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('surfaces a database error instead of rendering an empty section', async () => {
    const { client } = mockClient(null, { message: 'nổ' })
    await expect(getEntriesContaining(client, 'zh', '学')).rejects.toMatchObject({ message: 'nổ' })
  })

  it('rejects a row whose shape does not match rather than casting it', async () => {
    const { client } = mockClient([{ id: 'zh:学生', headword: '学生' }])
    await expect(getEntriesContaining(client, 'zh', '学')).rejects.toThrow()
  })

  it('treats a null result as nothing found', async () => {
    const { client } = mockClient(null)
    await expect(getEntriesContaining(client, 'zh', '学')).resolves.toEqual([])
  })
})
