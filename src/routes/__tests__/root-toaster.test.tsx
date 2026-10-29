// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  // Expose the route options so the test can render the real shell component.
  createRootRouteWithContext: () => (options: unknown) => options,
  HeadContent: () => null,
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  Scripts: () => null,
  useRouter: () => ({ options: { context: { queryClient: {} } } }),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    handler: (fn: unknown) => fn,
  }),
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({
  auth: vi.fn(),
}))

vi.mock('../../integrations/clerk/provider', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../../integrations/convex/provider', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/integrations/clerk/sign-out', () => ({
  SignOutProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

// Needs the real Convex auth provider, which is mocked out above.
vi.mock('../../integrations/convex/metrics', () => ({
  DiscoveryReturnMetric: () => null,
}))

describe('RootDocument', () => {
  it('keeps unmatched URLs out of the index with the current router match state', async () => {
    const { Route } = await import('../__root')
    const { head } = Route as unknown as {
      head: (context: {
        matches: Array<{ status: string; _notFound?: boolean }>
      }) => { meta: Array<Record<string, unknown>> }
    }

    expect(
      head({ matches: [{ status: 'success', _notFound: true }] }).meta,
    ).toContainEqual({ name: 'robots', content: 'noindex, nofollow' })
    expect(head({ matches: [{ status: 'success' }] }).meta).not.toContainEqual({
      name: 'robots',
      content: 'noindex, nofollow',
    })
  })

  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mounts one toast region that shows action failures', async () => {
    const { Route } = await import('../__root')
    const RootDocument = (
      Route as unknown as {
        shellComponent: ComponentType<{ children: ReactNode }>
      }
    ).shellComponent

    render(
      <RootDocument>
        <main>page</main>
      </RootDocument>,
      // The shell renders <html>, so mount it as the document itself.
      { container: document },
    )

    const regions = await screen.findAllByRole('region', {
      name: /notifications/i,
    })
    expect(regions).toHaveLength(1)

    act(() => {
      toast.error("couldn't open the conversation")
    })

    expect(
      await within(regions[0]!).findByText("couldn't open the conversation"),
    ).toBeTruthy()
  })
})
