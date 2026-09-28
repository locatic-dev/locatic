// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LxAvatar } from '../lx-avatar'
import { PersonRow } from '../person-row'

describe('PersonRow avatar', () => {
  it('reads the name once: the avatar image is decorative beside it', () => {
    render(
      <PersonRow
        avatarName="Ada Lovelace"
        avatarUrl="https://avatars.example/ada.png"
        title="Ada Lovelace"
        meta="@ada"
        renderIdentity={(content, className) => (
          <a href="/u/ada" className={className}>
            {content}
          </a>
        )}
      />,
    )

    const link = screen.getByRole('link')
    expect(link.textContent).toBe('Ada Lovelace@ada')
    expect(link.querySelector('img')?.getAttribute('alt')).toBe('')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('hides the initials fallback too', () => {
    render(<PersonRow avatarName="Ada Lovelace" title="Ada Lovelace" />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('AL').getAttribute('aria-hidden')).toBe('true')
  })

  it('keeps a standalone avatar named', () => {
    render(<LxAvatar name="Ada Lovelace" />)

    expect(screen.getByRole('img', { name: 'Ada Lovelace' })).toBeTruthy()
  })
})
