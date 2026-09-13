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

  // Closing sets `word` to null (WordlistClient passes `editWord`), so a reset
  // guarded on `word && open` never ran on the way out and the key it compares
  // stayed on the old id. Reopening the same word therefore skipped the sync
  // and showed the draft the user had just cancelled -- which then saved over
  // the real meaning, with no warning and nothing to undo it.
  it('forgets a cancelled draft when the same word is opened again', async () => {
    const onSave = vi.fn()
    const { rerender } = render(<EditWordDialog word={word} open onClose={() => {}} onSave={onSave} />)

    const meaning = screen.getByLabelText(/Nghĩa/i)
    await userEvent.clear(meaning)
    await userEvent.type(meaning, 'BẢN NHÁP ĐÃ HỦY')

    // Cancel: exactly what WordlistClient does -- setEditWord(null).
    rerender(<EditWordDialog word={null} open={false} onClose={() => {}} onSave={onSave} />)
    // Reopen the same word.
    rerender(<EditWordDialog word={word} open onClose={() => {}} onSave={onSave} />)

    expect(screen.getByLabelText(/Nghĩa/i)).toHaveValue('con chó')
    await userEvent.click(screen.getByRole('button', { name: /Lưu/i }))
    expect(onSave).toHaveBeenCalledWith('id1', {})
  })

  it('still syncs when a different word is opened', async () => {
    const other: UserWord = { ...word, id: 'id2', headword: 'cat', meaningVi: 'con mèo' }
    const { rerender } = render(<EditWordDialog word={word} open onClose={() => {}} onSave={vi.fn()} />)
    rerender(<EditWordDialog word={null} open={false} onClose={() => {}} onSave={vi.fn()} />)
    rerender(<EditWordDialog word={other} open onClose={() => {}} onSave={vi.fn()} />)
    expect(screen.getByLabelText(/Nghĩa/i)).toHaveValue('con mèo')
  })
})
