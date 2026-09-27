// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MarkdownPreview, MarkdownProse } from '../markdown-prose'

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
      screen.getByRole('heading', { level: 3, name: 'Section One' }),
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

  it('demotes headings so an embedded README never adds a second h1', () => {
    render(
      <>
        <h1>octo/app</h1>
        <MarkdownProse>
          {'# App\n\n## Install\n\n##### Notes\n\n###### Fine print'}
        </MarkdownProse>
      </>,
    )

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 2, name: 'App' })).toBeDefined()
    expect(
      screen.getByRole('heading', { level: 3, name: 'Install' }),
    ).toBeDefined()
    expect(
      screen.getByRole('heading', { level: 6, name: 'Notes' }),
    ).toBeDefined()
    expect(
      screen.getByRole('heading', { level: 6, name: 'Fine print' }),
    ).toBeDefined()
  })

  it('keeps source levels for a document written under the page h1', () => {
    render(
      <MarkdownProse demoteHeadings={false}>
        {'## 1. Scope\n\n### 1a. Detail'}
      </MarkdownProse>,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: '1. Scope' }),
    ).toBeDefined()
    expect(
      screen.getByRole('heading', { level: 3, name: '1a. Detail' }),
    ).toBeDefined()
  })

  it('opens external links safely in a new tab', () => {
    render(<MarkdownProse>{markdown}</MarkdownProse>)

    const link = screen.getByRole('link', { name: 'external link' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noreferrer noopener')
  })
})

describe('MarkdownPreview', () => {
  it('flattens an excerpt: no images, no live links, headings as text', () => {
    render(
      <MarkdownPreview>
        {
          '# Release\n\n![shot](https://x.test/a.png) see [notes](https://x.test)'
        }
      </MarkdownPreview>,
    )

    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Release')).toBeDefined()
    expect(screen.getByText('notes')).toBeDefined()
  })
})
