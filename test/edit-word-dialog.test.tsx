// test/edit-word-dialog.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditWordDialog } from '@/components/wordlist/EditWordDialog'
import type { UserWord } from '@/lib/wordlist/types'

const word: UserWord = {
  id: 'id1', lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: '/dɔːɡ/', pos: 'noun',
  meaningVi: 'con chó', meaningEn: 'dog', level: 'A1', example: null, exampleTranslation: null,
  audioUrl: null, notes: null, status: 'new', tags: [], createdAt: 'x', updatedAt: 'x',
}

describe('EditWordDialog', () => {
  it('saves edited meaning and status', async () => {
    const onSave = vi.fn()
    render(<EditWordDialog word={word} open onClose={() => {}} onSave={onSave} />)
    const meaning = screen.getByLabelText(/Nghĩa/i)
    await userEvent.clear(meaning)
    await userEvent.type(meaning, 'chó nhà')
    await userEvent.selectOptions(screen.getByLabelText(/Trạng thái/i), 'learning')
    await userEvent.click(screen.getByRole('button', { name: /Lưu/i }))
    expect(onSave).toHaveBeenCalledWith('id1', expect.objectContaining({ meaningVi: 'chó nhà', status: 'learning' }))
  })

  it('calls onSave with empty patch when nothing changed', async () => {
    const onSave = vi.fn()
    render(<EditWordDialog word={word} open onClose={() => {}} onSave={onSave} />)
    await userEvent.click(screen.getByRole('button', { name: /Lưu/i }))
    expect(onSave).toHaveBeenCalledWith('id1', {})
  })

  it('adds and removes tags via the tag editor', async () => {
    const onSave = vi.fn()
    const tagged: UserWord = { ...word, tags: ['animal'] }
    render(<EditWordDialog word={tagged} open onClose={() => {}} onSave={onSave} />)
    // remove the existing tag
    await userEvent.click(screen.getByLabelText(/Bỏ thẻ animal/i))
    // add a new one
    await userEvent.type(screen.getByPlaceholderText(/Thêm thẻ/i), 'pet')
    await userEvent.click(screen.getByRole('button', { name: /^Thêm thẻ$/i }))
    await userEvent.click(screen.getByRole('button', { name: /Lưu/i }))
    expect(onSave).toHaveBeenCalledWith('id1', expect.objectContaining({ tags: ['pet'] }))
  })
})
