// @vitest-environment jsdom
import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  createFileRoute:
    () =>
    <TOptions>(options: TOptions) => ({ options }),
}))

type BeforeLoad = (args: {
  context: { queryClient: { ensureQueryData: (options: unknown) => unknown } }
}) => Promise<unknown>

async function runBeforeLoad(isEmailAdmin: boolean | undefined) {
  const { Route } = await import('../_app/admin/emails')
  const beforeLoad = (
    Route as unknown as { options: { beforeLoad: BeforeLoad } }
  ).options.beforeLoad
  const ensureQueryData = vi.fn(async () => ({
    isAuthenticated: true,
    needsOnboarding: false,
    status: 'ready',
    viewer: null,
    ...(isEmailAdmin === undefined ? {} : { isEmailAdmin }),
  }))
  return {
    result: beforeLoad({ context: { queryClient: { ensureQueryData } } }),
    ensureQueryData,
  }
}

describe('/admin/emails guard', () => {
  it('redirects members who are not email admins to /home', async () => {
    for (const flag of [false, undefined]) {
      const { result } = await runBeforeLoad(flag)
      const error = await result.then(
        () => null,
        (thrown: unknown) => thrown,
      )
      expect(isRedirect(error)).toBe(true)
      expect((error as { options: { to: string } }).options.to).toBe('/home')
    }
  })

  it('lets email admins through using the cached viewer bootstrap', async () => {
    const { result, ensureQueryData } = await runBeforeLoad(true)
    await expect(result).resolves.toBeUndefined()
    expect(ensureQueryData).toHaveBeenCalledTimes(1)
  })
})
