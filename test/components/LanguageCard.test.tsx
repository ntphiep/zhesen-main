import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LanguageCard } from '@/components/LanguageCard'

describe('LanguageCard', () => {
  it('renders name, native name, and links to the language', () => {
    render(<LanguageCard language={{ code: 'zh', name: 'Tiếng Trung', nativeName: '中文', script: 'han' }} />)
    expect(screen.getByText('Tiếng Trung')).toBeInTheDocument()
    expect(screen.getByText('中文')).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/learn/zh')
  })
})
