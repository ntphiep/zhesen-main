import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddWordDialog } from '@/components/wordlist/AddWordDialog'

vi.mock('@/lib/dictionary/searchClient', () => ({
  fetchSearch: vi.fn(async () => ({
    status: 'ok',
    data: { forward: { en: [{ id: 'en:dog', lang: 'en', headword: 'dog', traditional: null, level: 'A1', ipa: '/dɔːɡ/', pos: 'noun', glossVi: 'con chó', glossEn: 'dog', audioUrl: null }], es: [], zh: [] }, reverse: { en: [], es: [], zh: [] }, suggestions: [] },
  })),
}))

describe('AddWordDialog', () => {
  it('searches and adds a dictionary entry', async () => {
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.type(screen.getByPlaceholderText(/Tìm từ/i), 'dog')
    expect(await screen.findByText('con chó')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Thêm/i }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ headword: 'dog', meaningVi: 'con chó', entryId: 'en:dog' }))
  })

  it('manual tab requires a headword', async () => {
    const onAdd = vi.fn()
    render(<AddWordDialog open onClose={() => {}} onAdd={onAdd} />)
    await userEvent.click(screen.getByRole('tab', { name: /Thủ công/i }))
    await userEvent.click(screen.getByRole('button', { name: /Lưu từ/i }))
    expect(onAdd).not.toHaveBeenCalled()
  })
})
