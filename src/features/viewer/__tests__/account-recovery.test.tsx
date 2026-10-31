// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AccountRecovery } from '../account-recovery'

const mocks = vi.hoisted(() => ({ restore: vi.fn() }))
vi.mock('convex/react', () => ({ useMutation: () => mocks.restore }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/integrations/clerk/sign-out', () => ({ useSignOut: () => vi.fn() }))

const NOW = Date.UTC(2026, 9, 23, 12)
const state = (purgeAfter: number) =>
  ({ status: 'deletion_pending', canRestore: true, purgeAfter }) as const
beforeEach(() => vi.useFakeTimers({ now: NOW }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('hydrates the recovery deadline consistently across time zones', async () => {
  const originalZone = process.env.TZ
  const container = document.createElement('div')
  try {
    const content = (
      <AccountRecovery state={state(NOW + 86_400_000)} destination="/home" />
    )
    process.env.TZ = 'UTC'
    container.innerHTML = renderToString(content)
    const deadline = container.querySelector('time')!.textContent
    process.env.TZ = 'Asia/Kolkata'
    const recoverable = vi.fn()
    const root = hydrateRoot(container, content, {
      onRecoverableError: recoverable,
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(recoverable).not.toHaveBeenCalled()
    expect(container.querySelector('time')!.textContent).toBe(deadline)
    act(() => root.unmount())
  } finally {
    if (originalZone === undefined) delete process.env.TZ
    else process.env.TZ = originalZone
    container.remove()
  }
})

it('hydrates the server eligibility snapshot when the deadline passes in transit', async () => {
  const content = (
    <AccountRecovery state={state(NOW + 100)} destination="/home" />
  )
  const container = document.createElement('div')
  container.innerHTML = renderToString(content)
  expect(container.textContent).toContain('account scheduled for deletion')
  vi.setSystemTime(NOW + 101)
  const recoverable = vi.fn()
  const root = hydrateRoot(container, content, {
    onRecoverableError: recoverable,
  })
  await act(async () => {
    await Promise.resolve()
  })
  expect(recoverable).not.toHaveBeenCalled()
  expect(container.textContent).toContain('account unavailable')
  expect(container.querySelector('button')?.textContent).toBe('sign out')
  act(() => root.unmount())
  container.remove()
})

it('expires the restore control while mounted and handles windows longer than a 32-bit timer', async () => {
  const remaining = 30 * 86_400_000
  render(<AccountRecovery state={state(NOW + remaining)} destination="/home" />)
  await act(async () => {
    vi.advanceTimersByTime(remaining - 1)
  })
  expect(screen.getByRole('button', { name: 'restore account' })).toBeTruthy()
  await act(async () => {
    vi.advanceTimersByTime(1)
  })
  expect(screen.queryByRole('button', { name: 'restore account' })).toBeNull()
  expect(
    screen.getByRole('heading', { name: 'account unavailable' }),
  ).toBeTruthy()
})

it('rechecks expiry before requesting restoration even if the timer has not fired', () => {
  render(<AccountRecovery state={state(NOW + 1000)} destination="/home" />)
  vi.setSystemTime(NOW + 1001)
  fireEvent.click(screen.getByRole('button', { name: 'restore account' }))
  expect(mocks.restore).not.toHaveBeenCalled()
  expect(
    screen.getByRole('heading', { name: 'account unavailable' }),
  ).toBeTruthy()
})
