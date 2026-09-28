// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDeleteDialog } from '../confirm-delete-dialog'

function DeleteControl({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        delete
      </button>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title="delete this comment?"
        description="replies stay."
        onConfirm={onConfirm}
      />
    </>
  )
}

describe('ConfirmDeleteDialog', () => {
  it('returns focus to the control that opened it when cancelled', async () => {
    const user = userEvent.setup()
    render(<DeleteControl onConfirm={vi.fn()} />)
    const opener = screen.getByRole('button', { name: 'delete' })

    await user.click(opener)
    expect(
      screen.getByRole('dialog', { name: 'delete this comment?' }),
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'cancel' }))

    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('returns focus to the opener after Escape', async () => {
    const user = userEvent.setup()
    render(<DeleteControl onConfirm={vi.fn()} />)
    const opener = screen.getByRole('button', { name: 'delete' })

    opener.focus()
    await user.keyboard('{Enter}')
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})
