// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LxAvatar } from '../lx-avatar'

describe('LxAvatar', () => {
  it('falls back to named initials when the image fails to load', () => {
    render(<LxAvatar name="Ada Lovelace" avatarUrl="https://x.test/a.png" />)

    fireEvent.error(screen.getByRole('img', { name: 'Ada Lovelace' }))

    const fallback = screen.getByRole('img', { name: 'Ada Lovelace' })
    expect(fallback.tagName).not.toBe('IMG')
    expect(fallback.textContent).toBe('AL')
  })

  it('tries a new image URL after an earlier one failed', () => {
    const { rerender } = render(
      <LxAvatar name="Ada" avatarUrl="https://x.test/old.png" />,
    )
    fireEvent.error(screen.getByRole('img', { name: 'Ada' }))

    rerender(<LxAvatar name="Ada" avatarUrl="https://x.test/new.png" />)

    const image = screen.getByRole('img', { name: 'Ada' })
    expect(image.tagName).toBe('IMG')
    expect(image.getAttribute('src')).toBe('https://x.test/new.png')
  })
})
