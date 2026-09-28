// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../dialog'

describe('Dialog', () => {
  it('names the dialog from its title and closes from a named close button', () => {
    render(
      <Dialog>
        <DialogTrigger>open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Manage repositories</DialogTitle>
          <DialogDescription>Pick the repos to show.</DialogDescription>
        </DialogContent>
      </Dialog>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(
      screen.getByRole('dialog', { name: 'Manage repositories' }),
    ).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
