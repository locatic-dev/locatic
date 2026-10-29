// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LxAvatar } from '../lx-avatar'
import { PersonRow } from '../person-row'

describe('PersonRow avatar', () => {
  it('keeps identity, disclosed region and member actions independent', () => {
    const open = vi.fn()
    const follow = vi.fn()
    const message = vi.fn()
    render(
      <PersonRow
        avatarName="Alexandria Catherine Longname"
        title="Alexandria Catherine Longname"
        meta="@a-very-long-builder-handle"
        onClick={open}
        location={{ kind: 'region', regionLabel: 'Karnataka, India' }}
        action={
          <>
            <button onClick={message}>message</button>
            <button onClick={follow}>follow</button>
          </>
        }
      />,
    )
    const identity = screen.getByRole('button', {
      name: /Alexandria Catherine/,
    })
    expect(identity.textContent).toContain('@a-very-long-builder-handle')
    expect(identity.contains(screen.getByText('Karnataka, India'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'follow' }))
    fireEvent.click(screen.getByRole('button', { name: 'message' }))
    expect(follow).toHaveBeenCalledOnce()
    expect(message).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(identity)
    expect(open).toHaveBeenCalledOnce()
  })
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
