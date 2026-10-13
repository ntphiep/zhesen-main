import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkActionBar } from '@/components/wordlist/BulkActionBar'
import { KNOWN_HINT, type UserWord } from '@/lib/wordlist/types'

const word = { id: 'a', lang: 'en', headword: 'dog', meaningVi: 'con chó' } as UserWord

describe('BulkActionBar status', () => {
  it('rests on its prompt and applies a status as soon as it is chosen', async () => {
    const onBulkStatus = vi.fn()
    render(<BulkActionBar selectedWords={[word]} allTags={[]} onBulkTag={vi.fn()} onAiTag={vi.fn()} onBulkStatus={onBulkStatus} onBulkDelete={vi.fn()} />)
    const select = screen.getByRole('combobox', { name: 'Đổi trạng thái các từ đã chọn' })
    expect(select).toHaveValue('')
    expect(screen.queryByText(KNOWN_HINT)).not.toBeInTheDocument()

    await userEvent.selectOptions(select, 'known')
    expect(onBulkStatus).toHaveBeenCalledWith('known')
    expect(select).toHaveValue('')
    expect(screen.getByText(KNOWN_HINT)).toBeInTheDocument()

    await userEvent.selectOptions(select, 'learning')
    expect(onBulkStatus).toHaveBeenLastCalledWith('learning')
    expect(screen.queryByText(KNOWN_HINT)).not.toBeInTheDocument()
  })
})
