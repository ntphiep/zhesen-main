// test/edit-word-dialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditWordDialog } from '@/components/wordlist/EditWordDialog'
import type { UserWord } from '@/lib/wordlist/types'

const word: UserWord = {
  id: 'id1', lang: 'en', entryId: 'en:dog', headword: 'dog', reading: null, ipa: '/dɔːɡ/', pos: 'noun',
  meaningVi: 'con chó', meaningEn: 'dog', level: 'A1', example: null, exampleTranslation: null,
  audioUrl: null, notes: null, status: 'new', tags: [], createdAt: 'x', updatedAt: 'x',
}
beforeEach(() => { HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn() })

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
})
