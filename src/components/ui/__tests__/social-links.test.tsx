// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SocialLinks } from '../social-links'

const noLinks = { x: null, linkedin: null, bluesky: null, website: null }

describe('SocialLinks', () => {
  it('renders only the links that have values', () => {
    render(
      <SocialLinks
        githubUsername="octo"
        links={{ ...noLinks, website: 'https://octo.dev' }}
      />,
    )

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://github.com/octo',
      'https://octo.dev/',
    ])
    expect(screen.queryByRole('link', { name: 'x profile' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'linkedin profile' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'bluesky profile' })).toBeNull()
  })

  it('links bluesky to its profile page', () => {
    render(
      <SocialLinks
        githubUsername="octo"
        links={{ ...noLinks, bluesky: 'octo.bsky.social' }}
      />,
    )

    expect(
      screen
        .getByRole('link', { name: 'bluesky profile' })
        .getAttribute('href'),
    ).toBe('https://bsky.app/profile/octo.bsky.social')
  })

  it('gives every link an accessible name and opens it in a new tab', () => {
    render(
      <SocialLinks
        githubUsername="octo"
        links={{
          x: 'octo',
          linkedin: 'https://linkedin.com/in/octo',
          bluesky: 'octo.bsky.social',
          website: 'octo.dev',
        }}
      />,
    )

    for (const name of [
      'github profile',
      'x profile',
      'linkedin profile',
      'bluesky profile',
      'website',
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener noreferrer')
    }
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  it('marks member-entered links nofollow ugc, but not the verified GitHub link', () => {
    render(
      <SocialLinks
        githubUsername="octo"
        links={{
          x: 'octo',
          linkedin: 'https://www.linkedin.com/in/octo',
          bluesky: 'octo.bsky.social',
          website: 'octo.dev',
        }}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'github profile' }).getAttribute('rel'),
    ).toBe('noopener noreferrer')
    for (const name of [
      'x profile',
      'linkedin profile',
      'bluesky profile',
      'website',
    ]) {
      expect(screen.getByRole('link', { name }).getAttribute('rel')).toBe(
        'noopener noreferrer nofollow ugc',
      )
    }
  })

  it('drops a javascript: website instead of rendering a script link', () => {
    render(
      <SocialLinks
        githubUsername="octo"
        links={{ ...noLinks, website: 'javascript:alert(1)' }}
      />,
    )

    expect(screen.queryByRole('link', { name: 'website' })).toBeNull()
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/^javascript:/i)
    }
  })

  it('keeps linkedin subdomains but drops a linkedin icon pointing elsewhere', () => {
    const { unmount } = render(
      <SocialLinks
        githubUsername="octo"
        links={{ ...noLinks, linkedin: 'https://in.linkedin.com/in/octo' }}
      />,
    )
    expect(
      screen
        .getByRole('link', { name: 'linkedin profile' })
        .getAttribute('href'),
    ).toBe('https://in.linkedin.com/in/octo')
    unmount()

    for (const linkedin of [
      'https://evil.example/in/octo',
      'https://linkedin.com.evil.example/in/octo',
      'https://notlinkedin.com/in/octo',
    ]) {
      const { unmount: unmountEach } = render(
        <SocialLinks githubUsername="octo" links={{ ...noLinks, linkedin }} />,
      )
      expect(
        screen.queryByRole('link', { name: 'linkedin profile' }),
      ).toBeNull()
      unmountEach()
    }
  })

  it('renders nothing without links or a GitHub username', () => {
    const { container } = render(
      <SocialLinks githubUsername="" links={noLinks} />,
    )

    expect(container.childElementCount).toBe(0)
  })
})
