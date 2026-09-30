// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  SheetContent,
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

  it('opens a sheet named by its title, closes on Escape and returns focus to the trigger', async () => {
    render(
      <Dialog>
        <DialogTrigger>filters</DialogTrigger>
        <SheetContent aria-describedby={undefined}>
          <DialogTitle>filters</DialogTitle>
          <button type="button">TypeScript</button>
        </SheetContent>
      </Dialog>,
    )

    const trigger = screen.getByRole('button', { name: 'filters' })
    trigger.focus()
    fireEvent.click(trigger)
    const sheet = screen.getByRole('dialog', { name: 'filters' })
    expect(sheet).toBeDefined()
    expect(within(sheet).getByRole('button', { name: 'Close' })).toBeDefined()

    fireEvent.keyDown(sheet, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })
  it('slides the phone sheet up only below md, so the md drawer slides straight in', () => {
    render(
      <Dialog open>
        <SheetContent aria-describedby={undefined}>
          <DialogTitle>filters</DialogTitle>
        </SheetContent>
      </Dialog>,
    )

    const classes = screen.getByRole('dialog').className.split(/\s+/)
    // tw-animate's slide-in-from-bottom sets the enter translate-y; left
    // unscoped it would add to the drawer's translate-x (a diagonal slide).
    const verticalSlides = classes.filter((name) =>
      /slide-(in-from|out-to)-bottom/.test(name),
    )
    expect(verticalSlides.length).toBeGreaterThan(0)
    for (const name of verticalSlides) {
      expect(name.startsWith('max-md:')).toBe(true)
    }
    expect(classes).toContain('md:data-[state=open]:slide-in-from-right')
  })
})
