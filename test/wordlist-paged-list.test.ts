import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePagedList } from '@/lib/hooks/usePagedList'
import { resetStoredPrefCache } from '@/lib/hooks/useStoredPref'

const list = Array.from({ length: 425 }, (_, i) => i + 1)

beforeEach(() => {
  localStorage.clear()
  resetStoredPrefCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('usePagedList', () => {
  it('hands over one page at a time and says where the reader is', () => {
    const { result } = renderHook(() => usePagedList(list, 'all'))
    expect(result.current.items).toHaveLength(50)
    expect(result.current.items[0]).toBe(1)
    expect(result.current.pageCount).toBe(9)
    expect(result.current.from).toBe(1)
    expect(result.current.to).toBe(50)

    act(() => result.current.setPage(3))
    expect(result.current.items[0]).toBe(101)
    expect(result.current.from).toBe(101)
  })

  it('refuses a page that does not exist', () => {
    const { result } = renderHook(() => usePagedList(list, 'all'))
    act(() => result.current.setPage(99))
    expect(result.current.page).toBe(9)
    act(() => result.current.setPage(-2))
    expect(result.current.page).toBe(1)
  })

  // Narrowing the filter while deep in the list must not leave an empty table.
  it('returns to the first page when the filter changes', () => {
    const { result, rerender } = renderHook(
      ({ items, sig }: { items: number[]; sig: string }) => usePagedList(items, sig),
      { initialProps: { items: list, sig: 'all' } },
    )
    act(() => result.current.setPage(5))
    expect(result.current.page).toBe(5)

    rerender({ items: list.slice(0, 12), sig: 'query=dog' })
    expect(result.current.page).toBe(1)
    expect(result.current.items).toHaveLength(12)
  })

  // Changing 50 to 25 on page 3 lands on the page holding row 101, not back at the top.
  it('keeps the first row of the page in view when the page size changes', () => {
    const { result } = renderHook(() => usePagedList(list, 'all'))
    act(() => result.current.setPage(3))
    act(() => result.current.setPageSize(25))
    expect(result.current.pageSize).toBe(25)
    expect(result.current.items[0]).toBe(101)
    expect(result.current.page).toBe(5)
  })

  it('remembers the page size for the next visit', () => {
    const first = renderHook(() => usePagedList(list, 'all'))
    act(() => first.result.current.setPageSize(200))
    first.unmount()

    const second = renderHook(() => usePagedList(list, 'all'))
    expect(second.result.current.pageSize).toBe(200)
    expect(second.result.current.items).toHaveLength(200)
  })

  // Safari's private mode throws on setItem. The choice must still take effect for this
  // page, or the control looks broken rather than forgetful.
  it('still changes the page size when storage refuses to hold it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is blocked')
    })
    const { result } = renderHook(() => usePagedList(list, 'all'))
    act(() => result.current.setPageSize(25))
    expect(result.current.pageSize).toBe(25)
    expect(result.current.items).toHaveLength(25)
  })

  it('reads an empty list as one empty page rather than none', () => {
    const { result } = renderHook(() => usePagedList([], 'all'))
    expect(result.current.pageCount).toBe(1)
    expect(result.current.total).toBe(0)
    expect(result.current.from).toBe(0)
  })
})
