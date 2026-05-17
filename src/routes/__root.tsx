import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  type ErrorComponentProps,
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

  const authState = await auth()
  const useConvexTokenTemplate = authState.sessionClaims?.aud !== 'convex'

  return {
    isAuthenticated: authState.isAuthenticated,
    token: authState.isAuthenticated
      ? await authState.getToken(
          useConvexTokenTemplate ? { template: 'convex' } : undefined,
        )
      : null,
    userId: authState.userId,
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
  errorComponent: RootErrorPage,
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

function RootErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const message =
    error instanceof Error
      ? error.message
      : 'Something went wrong while loading this page.'
  const isAuthConfigError =
    message.includes('NoAuthProvider') ||
    message.includes('issuer and audience match')

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-text">
      <div className="flex w-full max-w-140 flex-col gap-4.5 rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-2.5">
          <Logo size={18} />
          <span className="font-mono text-[13px] font-bold">locatic</span>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-mono text-lg font-bold">
            {isAuthConfigError
              ? 'Authentication needs one more sync'
              : 'Something interrupted this page'}
          </h1>
          <p className="m-0 text-sm leading-6 text-text-muted">
            {isAuthConfigError
              ? 'Locatic reached Clerk, but the token used for this request was not the Convex-scoped token. Retrying after refresh usually clears it once auth finishes syncing.'
              : 'The route hit an unexpected error. You can retry this request or head back to sign in.'}
          </p>
        </div>

        <div className="overflow-wrap-anywhere rounded-control border border-line bg-canvas px-3 py-2.5 font-mono text-[11.5px] text-text-faint wrap-anywhere whitespace-pre-wrap">
          {message}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              reset()
              void router.invalidate()
            }}
            className="min-h-11 rounded-[5px] bg-brand px-4 py-2.5 font-mono text-[12.5px] font-bold text-[#0d1117]"
            type="button"
          >
            Retry
          </button>
          <Link
            to="/sign-in"
            className="inline-flex min-h-11 items-center rounded-[5px] border border-line bg-surface-alt px-4 py-2.5 font-mono text-[12.5px] font-bold text-text no-underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas text-text">
      {/* Faded dot-map backdrop */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.22]"
        style={{
          maskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 72%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 30%, transparent 72%)',
        }}
      >
        <DotMap width={960} height={520} />
      </div>

      <div className="relative z-1 max-w-120 px-6 text-center">
        {/* Wordmark */}
        <div className="mb-12 flex items-center justify-center gap-2.5">
          <Logo size={20} />
          <span className="font-mono text-sm font-bold tracking-[-0.02em]">
            locatic
          </span>
        </div>

        {/* 404 */}
        <div className="mb-5 font-mono text-[clamp(72px,14vw,144px)] leading-none font-bold tracking-tighter text-brand">
          404
        </div>

        <h1 className="mb-3 mt-0 font-mono text-xl font-semibold tracking-[-0.02em] text-text">
          page not found
        </h1>

        <p className="mb-9 mt-0 font-sans text-[15px] leading-6 text-text-muted">
          this coordinate doesn't exist on the map. the path you followed leads
          nowhere.
        </p>

        <div className="flex flex-col items-center gap-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-[5px] bg-brand px-5 py-2.75 font-mono text-[13px] font-semibold text-[#0d1117] no-underline"
          >
            <ArrowLeft size={14} />
            go home
          </Link>

          <div className="rounded-control border border-line px-2.5 py-1 font-mono text-[11px] text-text-faint">
            error:404 · route not matched
          </div>
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
      <body className="antialiased wrap-anywhere">
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
