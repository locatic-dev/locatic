// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmptyState } from '../empty-state'

describe('EmptyState', () => {
  it('titles a page-level empty state with an h2 by default', () => {
    render(<EmptyState title="nothing here yet." />)

    expect(
      screen.getByRole('heading', { level: 2, name: 'nothing here yet.' }),
    ).toBeDefined()
  })

  it('nests under a section heading at the requested level', () => {
    render(
      <section>
        <h2>recent work</h2>
        <EmptyState size="compact" headingLevel={3} title="no work yet." />
      </section>,
    )

    expect(
      screen.getByRole('heading', { level: 3, name: 'no work yet.' }),
    ).toBeDefined()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
  })
})
