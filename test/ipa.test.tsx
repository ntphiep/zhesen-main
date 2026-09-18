import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Ipa } from '@/components/ui/Ipa'

describe('Ipa', () => {
  it('shows an English transcription with the slashes it arrives without', () => {
    render(<Ipa value="hoʊld" lang="en" />)
    expect(screen.getByText('/hoʊld/')).toBeInTheDocument()
  })

  it('does not double the slashes a Spanish transcription already has', () => {
    render(<Ipa value="/ˈola/" lang="es" />)
    expect(screen.getByText('/ˈola/')).toBeInTheDocument()
    expect(screen.queryByText('//ˈola//')).toBeNull()
  })

  it('leaves Chinese pinyin without phonemic slashes', () => {
    render(<Ipa value="yǒu méi yǒu" lang="zh" />)
    expect(screen.getByText('yǒu méi yǒu')).toBeInTheDocument()
  })

  // With no transcription the component must render nothing at all, not an
  // empty styled span, since call sites rely on it rather than guarding themselves.
  it('renders nothing when there is no transcription', () => {
    const { container } = render(<Ipa value={null} lang="en" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the ipa font class alongside whatever the caller passes', () => {
    render(<Ipa value="keɪs" lang="en" className="text-xs" />)
    expect(screen.getByText('/keɪs/')).toHaveClass('ipa', 'text-xs')
  })
})
