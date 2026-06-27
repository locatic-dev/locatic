// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MarkdownProse } from '../markdown-prose'

const markdown = `## Section One

A paragraph with an [external link](https://example.com).

- first bullet
- second bullet

| Data Type | Visibility |
| --- | --- |
| Likes | Public |
`

describe('MarkdownProse', () => {
  it('renders headings, lists, and GFM tables', () => {
    const { container } = render(<MarkdownProse>{markdown}</MarkdownProse>)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Section One' }),
    ).toBeDefined()
    expect(screen.getByText('first bullet')).toBeDefined()

    // remark-gfm renders the pipe table as a real <table>.
    const table = document.querySelector('table')
    expect(table).not.toBeNull()
    expect(
      screen.getByRole('columnheader', { name: 'Data Type' }),
    ).toBeDefined()
    expect(screen.getByRole('cell', { name: 'Likes' })).toBeDefined()
    expect(container.querySelector('[node]')).toBeNull()
  })

  it('opens external links safely in a new tab', () => {
    render(<MarkdownProse>{markdown}</MarkdownProse>)

    const link = screen.getByRole('link', { name: 'external link' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer noopener')
  })
})
