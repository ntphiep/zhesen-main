import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionLabel, Term } from '@/components/lookup/WordParts'
import { groupWordForms } from '@/lib/dictionary/family'
import { registerLabel } from '@/lib/dictionary/learner'
import { grammarLabels } from '@/lib/dictionary/origin'
import { posGroups } from '@/lib/dictionary/pos'
import { termEn } from '@/lib/dictionary/termEn'

describe('termEn', () => {
  it('names the sections a learner meets in English textbooks', () => {
    expect(termEn('Cụm động từ')).toBe('phrasal verb')
    expect(termEn('Kết hợp hay gặp')).toBe('collocation')
    expect(termEn('Họ từ')).toBe('word family')
    expect(termEn('Nguồn gốc')).toBe('etymology')
  })

  it('names every word form, grammar label, register and part of speech the page prints', () => {
    const forms = groupWordForms([
      'third-person singular simple present', 'plural', 'simple past', 'past participle', 'present participle',
      'simple past and past participle', 'comparative', 'superlative', 'feminine', 'masculine plural', 'diminutive', 'imperative',
    ].map((formLabel, i) => ({ formText: `f${i}`, formLabel })))
    for (const f of forms) expect(termEn(f.label), f.label).not.toBeNull()

    const tags = [
      'countable', 'uncountable', 'plural-only', 'plural-normally', 'singular-only', 'transitive', 'intransitive', 'ambitransitive',
      'ditransitive', 'reflexive', 'copulative', 'auxiliary', 'passive', 'not-comparable', 'attributive', 'predicative', 'negative',
    ]
    for (const t of tags) {
      const [label] = grammarLabels({ senseGrammar: { s: [t] } }, ['s'])
      expect(termEn(label), label).not.toBeNull()
    }
    expect(termEn(grammarLabels({ senseGrammar: { s: ['countable', 'uncountable'] } }, ['s'])[0])).toBe('countable, uncountable')

    for (const r of ['formal', 'informal', 'slang', 'vulgar', 'offensive', 'archaic', 'dated', 'literary', 'regional', 'rare']) {
      expect(termEn(registerLabel(r)), r).not.toBeNull()
    }
    const pos = posGroups(['noun', 'verb', 'adj', 'adv', 'pron', 'det', 'prep', 'conj', 'intj', 'num', 'name', 'article', 'particle', 'phrase'])
    for (const g of pos) expect(termEn(g.labelVi), g.labelVi).not.toBeNull()
  })

  it('leaves a label that is not a grammar term alone', () => {
    expect(termEn('Ví dụ')).toBeNull()
    expect(termEn('constructor')).toBeNull()
  })
})

describe('Term', () => {
  it('prints the English name after the Vietnamese, in the heading a screen reader announces', () => {
    render(<SectionLabel>Cụm động từ</SectionLabel>)
    expect(screen.getByRole('heading', { name: 'Cụm động từ (phrasal verb)' })).toBeInTheDocument()
    expect(screen.getByText('(phrasal verb)')).toHaveAttribute('lang', 'en')
  })

  it('lowers only the first letter, and prints a label it does not know as it is', () => {
    const { container } = render(<p><Term vi="Phân từ II" lower /> · <Term vi="Ví dụ" /></p>)
    expect(container).toHaveTextContent('phân từ II (past participle) · Ví dụ')
  })
})
