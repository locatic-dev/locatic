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

  it('lines its content up with the feed column unless the page is wide', () => {
    const { container, rerender } = render(<PageHeader title="home" />)
    const column = () => container.querySelector('header > div')

    expect(column()?.classList.contains('lx-page-width-feed')).toBe(true)

    rerender(<PageHeader title="community email" width="wide" />)

    expect(column()?.classList.contains('lx-page-width-wide')).toBe(true)
    expect(column()?.classList.contains('lx-page-width-feed')).toBe(false)
  })
})
