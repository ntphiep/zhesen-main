import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LessonList } from '@/components/LessonList'

const lessons = [
  { id: 'zh-l1', lang: 'zh' as const, title: 'Chào hỏi', description: 'desc', position: 1, vocabIds: ['zh-1'] },
]

describe('LessonList', () => {
  it('renders lessons linking to the lesson route', () => {
    render(<LessonList lang="zh" lessons={lessons} />)
    expect(screen.getByText('Chào hỏi')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Chào hỏi/ })).toHaveAttribute('href', '/learn/zh/lesson/zh-l1')
  })
})
