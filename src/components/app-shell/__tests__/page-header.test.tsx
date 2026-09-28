// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from '@/components/app-shell/page-header'

describe('PageHeader', () => {
  it('renders the title as the page heading', () => {
    render(<PageHeader title="home" />)

    expect(screen.getByRole('heading', { level: 1, name: 'home' })).toBeTruthy()
  })

  it('keeps the subtitle and actions outside the heading name', () => {
    render(
      <PageHeader
        title="explore"
        subtitle="// discover projects nearby"
        actions={<button type="button">reset</button>}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'explore' }),
    ).toBeTruthy()
    expect(screen.getByText('// discover projects nearby')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'reset' })).toBeTruthy()
  })
})
