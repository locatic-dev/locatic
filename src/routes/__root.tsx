import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  type ErrorComponentProps,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { auth } from '@clerk/tanstack-react-start/server'
import { LazyMotion, MotionConfig } from 'motion/react'
import { ThemeProvider } from 'next-themes'
import { Suspense, lazy, useEffect } from 'react'
import { THEME_IDS, DEFAULT_THEME_ID } from '@/lib/theme'
import ClerkProvider from '../integrations/clerk/provider'
import ConvexProvider from '../integrations/convex/provider'
import { DiscoveryReturnMetric } from '@/integrations/convex/metrics'
import { Logo } from '@/components/ui/logo'
import { DotMap } from '@/components/ui/dot-map'
import { ArrowLeft } from '@/lib/icons'
import { createClientRouteAuthStateGetter } from '@/lib/auth-routing'
import { getUserFacingErrorCopy } from '@/lib/error-display'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'
import { seo } from '@/lib/seo'
import {
  enableSkipLinkKeyboardMode,
  isSkipLinkKeyboardTrigger,
  resetSkipLinkFocusState,
} from '@/lib/skip-link'
import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'

interface MyRouterContext {
  convexQueryClient: ConvexQueryClient
  queryClient: QueryClient
}

const loadMotionFeatures = () =>
  import('@/lib/motion-features').then((module) => module.default)

// Sonner is ~10 KiB gzip; load it outside the initial client entry.
const Toaster = lazy(() =>
  import('@/components/ui/sonner').then((module) => ({
    default: module.Toaster,
  })),
)

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

const getClientRouteAuthState = createClientRouteAuthStateGetter(() =>
  fetchClerkAuth(),
)

async function getRouteAuthState() {
  if (typeof window === 'undefined') {
    return fetchClerkAuth()
  }

  return getClientRouteAuthState()
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async (ctx) => {
    const authState = await getRouteAuthState()

    if (authState.token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(authState.token)
    } else {
      ctx.context.convexQueryClient.serverHttpClient?.clearAuth()
    }

    return {
      auth: authState,
    }
  },
  head: ({ matches }) => {
    // An unknown URL renders NotFoundPage with a 404 status; keep it out of
    // search results.
    const notFound = matches.some((match) => match.globalNotFound)
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#090a0b' },
        ...seo(notFound ? { title: 'page not found', noindex: true } : {}).meta,
      ],
      links: [
        // Self-hosted fonts (@font-face in styles.css): one variable file per
        // family, both used by the first paint, so preload them before layout
        // settles.
        ...[
          '/fonts/geist-latin-wght.woff2',
          '/fonts/geist-mono-latin-wght.woff2',
        ].map((href) => ({
          rel: 'preload',
          href,
          as: 'font',
          type: 'font/woff2',
          crossOrigin: 'anonymous' as const,
        })),
        { rel: 'stylesheet', href: appCss },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: '/favicon-32.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-touch-icon.png',
        },
        { rel: 'manifest', href: '/manifest.json' },
      ],
    }
  },
  errorComponent: RootErrorPage,
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

// Mirror Button primary/touch and secondary/touch. Importing Button here
// would pull class-variance-authority and Radix Slot into the initial entry.
const primaryActionClass =
  'inline-flex h-8 items-center rounded-control border border-transparent bg-brand px-3.5 pointer-coarse:h-auto pointer-coarse:min-h-11 pointer-coarse:px-4 text-label font-semibold text-brand-foreground no-underline hover:bg-brand/90'
const secondaryActionClass =
  'inline-flex h-8 items-center rounded-control border border-control bg-transparent px-3.5 pointer-coarse:h-auto pointer-coarse:min-h-11 pointer-coarse:px-4 text-label text-text-muted no-underline transition-colors hover:border-line-strong hover:text-text'

export function RootErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()
  const href = useRouterState({ select: (state) => state.location.href })
  const errorCopy = getUserFacingErrorCopy(error)
  const redirect = toSafeRelativeUrl(href) ?? undefined

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-text"
    >
      <div className="flex w-full max-w-140 flex-col gap-4.5 rounded-card border border-line bg-surface p-6 shadow-card">
        <div className="flex items-center gap-2.5">
          <Logo size={18} />
          <span className="text-label font-bold">locatic</span>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-headline">{errorCopy.title}</h1>
          <p className="m-0 text-body text-text-muted">
            {errorCopy.description}
          </p>
        </div>

        {errorCopy.detail ? (
          <div className="overflow-wrap-anywhere rounded-control border border-line bg-canvas px-3 py-2.5 text-meta text-text-muted wrap-anywhere whitespace-pre-wrap">
            {errorCopy.detail}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {errorCopy.action === 'sign-in' && (
            <Link
              to="/sign-in/$"
              search={{ redirect }}
              className={primaryActionClass}
            >
              sign in again
            </Link>
          )}
          {/* Retry stays on the sign-in path too: when Clerk is still signed
              in but Convex rejected the token, /sign-in redirects straight
              back here, and retry is the way out of that loop. */}
          <button
            onClick={() => {
              // Clear React Query's error first: a private route's suspense
              // query (not prefetched by its loader on the client) would
              // otherwise rethrow its cached error on remount.
              queryErrorResetBoundary.reset()
              reset()
              void router.invalidate()
            }}
            className={
              errorCopy.action === 'sign-in'
                ? secondaryActionClass
                : primaryActionClass
            }
            type="button"
          >
            retry
          </button>
          <Link to="/" className={secondaryActionClass}>
            go home
          </Link>
        </div>
      </div>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-canvas text-text"
    >
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
          <span className="text-title font-bold">locatic</span>
        </div>

        {/* 404 */}
        <div className="mb-5 font-mono text-[clamp(72px,14vw,144px)] leading-none font-bold tracking-tighter text-brand">
          404
        </div>

        <h1 className="mb-3 mt-0 text-headline text-text">page not found</h1>

        <p className="mb-9 mt-0 text-body text-text-muted">
          this coordinate doesn't exist on the map. the path you followed leads
          nowhere.
        </p>

        <div className="flex flex-col items-center gap-6">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-brand px-5 text-label font-semibold text-brand-foreground no-underline"
          >
            <ArrowLeft size={14} />
            go home
          </Link>

          <div className="rounded-control border border-line px-2.5 py-1 text-meta text-text-muted">
            error:404 · route not matched
          </div>
        </div>
      </div>
    </main>
  )
}

/**
 * Cloudflare Web Analytics: cookieless page views and Web Vitals. Loaded only
 * in production builds that set the public beacon token, so local and preview
 * traffic is never counted. It follows client-side navigations on its own.
 */
const CF_BEACON_TOKEN: string | undefined = import.meta.env.PROD
  ? import.meta.env.VITE_CF_BEACON_TOKEN || undefined
  : undefined

function RootDocument({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="antialiased wrap-anywhere">
        <SkipLinkFocusManager />
        <a className="lx-skip-link" href="#main-content" data-skip-link="true">
          Skip to main content
        </a>
        <ThemeProvider
          attribute="data-theme"
          themes={[...THEME_IDS]}
          defaultTheme={DEFAULT_THEME_ID}
          enableSystem={false}
          disableTransitionOnChange
        >
          <LazyMotion features={loadMotionFeatures} strict>
            <MotionConfig reducedMotion="user">
              <ClerkProvider>
                <ConvexProvider
                  queryClient={router.options.context.queryClient}
                >
                  {children}
                  <DiscoveryReturnMetric />
                  <Suspense fallback={null}>
                    <Toaster />
                  </Suspense>
                </ConvexProvider>
              </ClerkProvider>
            </MotionConfig>
          </LazyMotion>
        </ThemeProvider>
        <Scripts />
        {CF_BEACON_TOKEN ? (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: CF_BEACON_TOKEN })}
          />
        ) : null}
      </body>
    </html>
  )
}

function SkipLinkFocusManager() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSkipLinkKeyboardTrigger(event.key)) {
        enableSkipLinkKeyboardMode(document)
      }
    }

    const handlePointerIntent = () => {
      resetSkipLinkFocusState(document)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        resetSkipLinkFocusState(document)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('pointerdown', handlePointerIntent, true)
    window.addEventListener('blur', handlePointerIntent)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('pointerdown', handlePointerIntent, true)
      window.removeEventListener('blur', handlePointerIntent)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}
