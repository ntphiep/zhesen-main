import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToeicView } from '@/components/theory/ToeicView'
import { theoryContent } from '@/lib/theory/content'
import { getLanguage } from '@/lib/languages'

const guide = theoryContent('en')?.toeic
const language = getLanguage('en')
if (!guide || !language) throw new Error('English TOEIC content is missing')

describe('TOEIC page', () => {
  it('links every part and every topic to a page of its own', () => {
    const { container } = render(<ToeicView language={language} guide={guide} />)
    const hrefs = new Set([...container.querySelectorAll('a')].map((a) => a.getAttribute('href')))
    const wanted = [
      ...guide.parts.map((p) => `/theory/en/toeic/part/${p.number}`),
      ...guide.wordTopics.map((t) => `/theory/en/toeic/topic/${t.id}`),
    ]
    expect(wanted).toHaveLength(19)
    for (const href of wanted) expect(hrefs).toContain(href)
  })

  it('keeps every part and topic on the page itself, under the anchors it had', () => {
    const { container } = render(<ToeicView language={language} guide={guide} />)
    for (const p of guide.parts) expect(container.querySelector(`#part-${p.number}`)).not.toBeNull()
    for (const t of guide.wordTopics) expect(container.querySelector(`#words-${t.id}`)).not.toBeNull()
    expect(screen.getByRole('link', { name: /Văn phòng và họp/ })).toHaveAttribute('href', '/theory/en/toeic/topic/office')
  })
})
