import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignIn } from '@clerk/tanstack-react-start'
import { useEffect, useState } from 'react'
import type { ViewerBootstrapPayload } from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { getAccountRecoveryState } from '@/features/viewer/lifecycle'
import { AccountRecovery } from '@/features/viewer/account-recovery'
import { Logo } from '@/components/ui/logo'
import { rememberDiscoveryReturn } from '@/integrations/convex/metrics'
import { buildOnboardingUrl, validateSignInSearch } from '@/lib/safe-redirect'
import { seo } from '@/lib/seo'

export const Route = createFileRoute('/sign-in/$')({
  // Accepts our `redirect` and, failing that, a same-origin destination from
  // Clerk's own `redirect_url` / `sign_in_force_redirect_url`.
  validateSearch: validateSignInSearch,
  beforeLoad: async ({ context, search }) => {
    if (!context.auth.isAuthenticated) {
      return { accountRecovery: null }
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload
    const accountRecovery = getAccountRecoveryState(bootstrap)
    if (accountRecovery) return { accountRecovery }

    // `validateSearch` has already sanitised the destination. It wins here;
    // the `_app` guard still sends users who need onboarding there first and
    // carries the destination along.
    if (search.redirect) {
      throw redirect({ href: search.redirect })
    }

    throw redirect({ to: bootstrap.needsOnboarding ? '/onboarding' : '/home' })
  },
  head: () => seo({ title: 'sign in', noindex: true }),
  component: SignInPage,
})

function SignInPage() {
  // Clerk force URLs are set only when a destination exists. Without one, the
  // fallbacks apply, so a destination Clerk already carries in its own query
  // string (for example across the OAuth callback) is not overridden.
  // New accounts always pass through onboarding with the destination attached.
  //
  // The destination is pinned at mount: Clerk's multi-step paths
  // (/sign-in/factor-one, /sign-in/sso-callback) navigate within this route
  // without our `redirect` parameter, and must not lose it.
  const searchDestination = Route.useSearch().redirect ?? null
  const { accountRecovery } = Route.useRouteContext()
  const [initialDestination] = useState(searchDestination)
  const destination = searchDestination ?? initialDestination
  useEffect(() => rememberDiscoveryReturn(destination), [destination])

  if (accountRecovery) {
    return <AccountRecovery state={accountRecovery} destination={destination} />
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="lx-page-width-form flex min-h-dvh flex-col items-center justify-center gap-7 bg-canvas py-8"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-headline text-text">locatic</span>
        </div>
        <p className="m-0 text-title text-text">
          GitHub with a <span className="text-brand">map.</span>
        </p>
        <p className="m-0 max-w-xs font-sans text-body leading-[1.5] text-text-muted">
          Sign in to discover what developers in your city are building.
        </p>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: 'w-full max-w-sm',
            card: 'rounded-card border border-line bg-surface shadow-card',
            headerTitle: 'font-mono text-text',
            headerSubtitle: 'text-text-muted',
            socialButtonsBlockButton:
              'border-line bg-surface-alt text-text hover:bg-muted',
            formButtonPrimary:
              'bg-brand text-brand-foreground font-mono font-semibold hover:opacity-90',
            formFieldInput: 'border-line bg-canvas font-mono text-text',
            footerActionLink: 'text-brand',
          },
        }}
        forceRedirectUrl={destination}
        fallbackRedirectUrl="/home"
        path="/sign-in"
        routing="path"
        signInUrl="/sign-in"
        signUpForceRedirectUrl={
          destination ? buildOnboardingUrl(destination) : null
        }
        signUpFallbackRedirectUrl={buildOnboardingUrl(null)}
        signUpUrl="/sign-in"
        transferable
        withSignUp
      />
    </main>
  )
}
