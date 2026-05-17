import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useRouter,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import ClerkProvider from '../integrations/clerk/provider'
import ConvexProvider from '../integrations/convex/provider'
import { Logo } from '@/components/ui/logo'
import { DotMap } from '@/components/ui/dot-map'
import { ArrowLeft } from '@/lib/icons'
import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'

interface MyRouterContext {
  convexQueryClient: ConvexQueryClient
  queryClient: QueryClient
}

const fetchClerkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error(
      'CLERK_SECRET_KEY is required for TanStack Start server auth',
    )
  }

  const { getToken, isAuthenticated, userId } = await auth()

  return {
    isAuthenticated,
    token: await getToken(),
    userId,
  }
})

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async (ctx) => {
    const authState = await fetchClerkAuth()

    if (authState.token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(authState.token)
    }

    return {
      auth: authState,
    }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Locatic — GitHub with a map.' },
      {
        name: 'description',
        content:
          'Discover what developers are building from locally to globally. Like it, comment on it, follow them.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--lx-bg)',
        color: 'var(--lx-text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Faded dot-map backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.22,
          pointerEvents: 'none',
          maskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 72%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 72%)',
        }}
      >
        <DotMap width={960} height={520} />
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          textAlign: 'center',
          padding: '0 24px',
          maxWidth: 480,
        }}
      >
        {/* Wordmark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 48,
          }}
        >
          <Logo size={20} />
          <span
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            locatic
          </span>
        </div>

        {/* 404 */}
        <div
          style={{
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 'clamp(72px, 14vw, 144px)',
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '-0.05em',
            color: 'var(--lx-accent)',
            marginBottom: 20,
          }}
        >
          404
        </div>

        <h1
          style={{
            margin: '0 0 12px',
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--lx-text)',
          }}
        >
          page not found
        </h1>

        <p
          style={{
            margin: '0 0 36px',
            fontFamily: 'var(--lx-font-sans)',
            fontSize: 15,
            color: 'var(--lx-text-2)',
            lineHeight: 1.6,
          }}
        >
          this coordinate doesn't exist on the map. the path you followed leads
          nowhere.
        </p>

        <Link
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 20px',
            background: 'var(--lx-accent)',
            color: '#0d1117',
            borderRadius: 5,
            textDecoration: 'none',
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={14} />
          go home
        </Link>

        <div
          style={{
            marginTop: 40,
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 11,
            color: 'var(--lx-text-3)',
            display: 'inline-block',
            padding: '4px 10px',
            border: '1px solid var(--lx-border)',
            borderRadius: 4,
          }}
        >
          error:404 · route not matched
        </div>
      </div>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased [overflow-wrap:anywhere]">
        <a className="lx-skip-link" href="#main-content">
          Skip to main content
        </a>
        <ClerkProvider>
          <ConvexProvider queryClient={router.options.context.queryClient}>
            {children}
          </ConvexProvider>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  )
}
