// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { linkify, splitLinkParts } from '../linkify'

describe('splitLinkParts', () => {
  it('returns nothing for empty input', () => {
    expect(splitLinkParts('')).toEqual([])
  })

  it('treats plain text as a single text part', () => {
    expect(splitLinkParts('just some words')).toEqual([
      { type: 'text', value: 'just some words' },
    ])
  })

  it('extracts a bare url as a link part', () => {
    expect(splitLinkParts('https://example.com/path')).toEqual([
      {
        type: 'link',
        value: 'https://example.com/path',
        href: 'https://example.com/path',
      },
    ])
  })

  it('splits text surrounding a url', () => {
    expect(splitLinkParts('see https://a.com now')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://a.com', href: 'https://a.com' },
      { type: 'text', value: ' now' },
    ])
  })

  it('handles multiple urls on one line', () => {
    const parts = splitLinkParts('https://a.com https://b.com')
    expect(parts.filter((part) => part.type === 'link')).toHaveLength(2)
  })

  it('excludes trailing sentence punctuation from the href', () => {
    expect(splitLinkParts('visit https://a.com.')).toEqual([
      { type: 'text', value: 'visit ' },
      { type: 'link', value: 'https://a.com', href: 'https://a.com' },
      { type: 'text', value: '.' },
    ])
  })
})

describe('linkify', () => {
  it('renders urls as safe external anchors', () => {
    render(<>{linkify('docs at https://example.com/x here')}</>)
    const link = screen.getByRole('link', { name: 'https://example.com/x' })
    expect(link.getAttribute('href')).toBe('https://example.com/x')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('renders plain text without anchors', () => {
    const { container } = render(<>{linkify('no links here')}</>)
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.textContent).toBe('no links here')
  })
})
