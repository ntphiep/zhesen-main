import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))

import Page, { dynamicParams, generateMetadata, generateStaticParams } from '@/app/theory/[lang]/toeic/part/[part]/page'

const params = (lang: string, part: string) => ({ params: Promise.resolve({ lang, part }) })

describe('TOEIC part page', () => {
  it('builds the seven parts of the one language with the block, and nothing else', () => {
    expect(generateStaticParams()).toEqual(['1', '2', '3', '4', '5', '6', '7'].map((part) => ({ lang: 'en', part })))
    expect(dynamicParams).toBe(false)
  })

  it('opens the practice set on Part 5 and leads on to Part 6', async () => {
    render(await Page(params('en', '5')))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Part 5. ')
    expect(screen.getByRole('heading', { name: 'Luyện Part 5' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tiếp theo/ })).toHaveAttribute('href', '/theory/en/toeic/part/6')
  })

  it('has no practice set on another part, and no way on after Part 7', async () => {
    const { unmount } = render(await Page(params('en', '6')))
    expect(screen.queryByRole('heading', { name: /^Luyện Part/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ngữ pháp hay ra' })).toBeInTheDocument()
    unmount()
    render(await Page(params('en', '7')))
    expect(screen.getByRole('heading', { name: 'Paraphrase' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Tiếp theo/ })).not.toBeInTheDocument()
  })

  it('answers 404 for a part outside the seven or a language without the block', async () => {
    for (const [lang, part] of [['en', '05'], ['en', '8'], ['es', '5']]) {
      await expect(Page(params(lang, part))).rejects.toThrow('NEXT_NOT_FOUND')
    }
  })

  it('names the part in its title and gives it its own canonical', async () => {
    const m = await generateMetadata(params('en', '5'))
    expect(m.title).toMatch(/^TOEIC Part 5: /)
    expect(m.description).toMatch(/rồi luyện \d+ câu\.$/)
    expect(m.alternates?.canonical).toBe('/theory/en/toeic/part/5')
    expect((await generateMetadata(params('en', '1'))).description).not.toMatch(/luyện/)
  })
})
