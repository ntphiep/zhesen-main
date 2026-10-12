import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WordlistToolbar } from '@/components/wordlist/WordlistToolbar'

function setup(over: Partial<Parameters<typeof WordlistToolbar>[0]> = {}) {
  const props: Parameters<typeof WordlistToolbar>[0] = {
    query: '', onQueryChange: vi.fn(), langFilter: '', onLangFilterChange: vi.fn(),
    statusFilter: '', onStatusFilterChange: vi.fn(), reviewFilter: '', onReviewFilterChange: vi.fn(),
    levelFilter: '', onLevelFilterChange: vi.fn(), levelOptions: [],
    posFilter: '', onPosFilterChange: vi.fn(),
    posOptions: [{ key: 'noun', abbr: 'n.', labelVi: 'Danh từ' }, { key: 'verb', abbr: 'v.', labelVi: 'Động từ' }],
    kindFilter: '', onKindFilterChange: vi.fn(),
    kindOptions: [{ key: 'word', label: 'Từ' }, { key: 'phrasal_verb', label: 'Cụm động từ' }],
    view: 'table', onViewChange: vi.fn(), onAddClick: vi.fn(), onExportCsv: vi.fn(), onExportAnki: vi.fn(), onImportClick: vi.fn(),
    ...over,
  }
  render(<WordlistToolbar {...props} />)
  return props
}

describe('the part-of-speech filter', () => {
  it('offers every label the column shows, a phrasal verb included', () => {
    setup()
    const select = screen.getByRole('combobox', { name: 'Lọc từ loại' })
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Tất cả từ loại', 'Từ', 'Cụm động từ', 'Danh từ (n.)', 'Động từ (v.)',
    ])
    expect(screen.queryByRole('combobox', { name: 'Lọc loại mục' })).not.toBeInTheDocument()
  })

  it('sets the kind and clears the part of speech, and the other way round', async () => {
    const props = setup()
    const select = screen.getByRole('combobox', { name: 'Lọc từ loại' })
    await userEvent.selectOptions(select, 'Cụm động từ')
    expect(props.onKindFilterChange).toHaveBeenLastCalledWith('phrasal_verb')
    expect(props.onPosFilterChange).toHaveBeenLastCalledWith('')
    await userEvent.selectOptions(select, 'Động từ (v.)')
    expect(props.onKindFilterChange).toHaveBeenLastCalledWith('')
    expect(props.onPosFilterChange).toHaveBeenLastCalledWith('verb')
  })
})
