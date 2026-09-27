// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Button, type ButtonVariant } from '../button'

const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger']

describe('Button', () => {
  it.each(variants)('%s renders a named, clickable button', (variant) => {
    const onClick = vi.fn()
    render(
      <Button variant={variant} onClick={onClick}>
        save
      </Button>,
    )

    const button = screen.getByRole<HTMLButtonElement>('button', {
      name: 'save',
    })
    fireEvent.click(button)

    expect(button.disabled).toBe(false)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it.each(variants)(
    '%s exposes the disabled state and ignores clicks',
    (variant) => {
      const onClick = vi.fn()
      render(
        <Button variant={variant} disabled onClick={onClick}>
          save
        </Button>,
      )

      const button = screen.getByRole<HTMLButtonElement>('button', {
        name: 'save',
      })
      fireEvent.click(button)

      expect(button.disabled).toBe(true)
      expect(onClick).not.toHaveBeenCalled()
    },
  )

  it('renders its child as the control with asChild', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/settings">settings</a>
      </Button>,
    )

    const link = screen.getByRole('link', { name: 'settings' })
    expect(link.getAttribute('href')).toBe('/settings')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
