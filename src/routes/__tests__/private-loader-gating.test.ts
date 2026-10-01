// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Private queries throw `Unauthorized` until Convex auth is ready, so these
// loaders prefetch only where the helper allows it (the server render) and
// otherwise leave the fetch to the page inside the auth-ready boundary.

const mocks = vi.hoisted(() => ({
  shouldPrefetch: vi.fn<() => boolean>(),
}))

vi.mock('@/lib/auth-routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-routing')>()),
  shouldPrefetchPrivateConvexQueries: mocks.shouldPrefetch,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  createFileRoute:
    () =>
    <TOptions>(options: TOptions) => ({ options }),
}))

type Loader = (args: {
  context: { queryClient: { ensureQueryData: (options: unknown) => unknown } }
  deps: Record<string, unknown>
}) => unknown

const routes: Array<[string, () => Promise<{ Route: unknown }>, number]> = [
  ['notifications', () => import('../_app/notifications'), 1],
  ['settings', () => import('../_app/settings'), 1],
  ['inbox', () => import('../_app/inbox'), 2],
  ['admin emails', () => import('../_app/admin/emails'), 1],
]

async function runLoader(load: () => Promise<{ Route: unknown }>) {
  const { Route } = await load()
  const loader = (Route as { options: { loader: Loader } }).options.loader
  const ensureQueryData = vi.fn(async () => null)
  await loader({ context: { queryClient: { ensureQueryData } }, deps: {} })
  return ensureQueryData
}

describe('private route loaders', () => {
  beforeEach(() => {
    mocks.shouldPrefetch.mockReset()
  })

  it.each(routes)(
    '%s skips private prefetches on client navigation',
    async (_name, load) => {
      mocks.shouldPrefetch.mockReturnValue(false)

      const ensureQueryData = await runLoader(load)

      expect(ensureQueryData).not.toHaveBeenCalled()
    },
  )

  it.each(routes)(
    '%s prefetches its private queries during the server render',
    async (_name, load, queryCount) => {
      mocks.shouldPrefetch.mockReturnValue(true)

      const ensureQueryData = await runLoader(load)

      expect(ensureQueryData).toHaveBeenCalledTimes(queryCount)
    },
  )
})
