// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountDangerZone } from '../account-danger-zone'

const mocks = vi.hoisted(() => ({
  deactivate: vi.fn(),
  deleteAccount: vi.fn(),
}))
vi.mock('../mutations', () => ({
  useDeactivateAccount: () => mocks.deactivate,
  useDeleteAccount: () => mocks.deleteAccount,
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('account deletion confirmation', () => {
  it('explains immediate hiding and the restoration window before deletion is requested', () => {
    render(<AccountDangerZone />)

    expect(screen.getByText(/restore.*30 days/i)).toBeTruthy()
    expect(screen.queryByText(/this cannot be undone/i)).toBeNull()
    expect(mocks.deleteAccount).not.toHaveBeenCalled()
  })

  it('keeps deletion behind typed confirmation and explains the same deadline in the dialog', () => {
    render(<AccountDangerZone />)
    fireEvent.click(screen.getByRole('button', { name: 'delete account' }))
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText(/30 days/)).toBeTruthy()
    const confirm = within(dialog).getByRole('button', {
      name: 'delete account',
    }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Type DELETE to confirm' }),
      { target: { value: 'DELETE' } },
    )
    expect(confirm.disabled).toBe(false)
  })
})
