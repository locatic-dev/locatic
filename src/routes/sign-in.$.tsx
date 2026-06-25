import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignIn } from '@clerk/tanstack-react-start'
import type { ViewerBootstrapPayload } from '@/features/contracts'
import { viewerQueryOptions } from '@/features/viewer/queries'
import { Logo } from '@/components/ui/logo'

export const Route = createFileRoute('/sign-in/$')({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isAuthenticated) {
      return
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    throw redirect({ to: bootstrap.needsOnboarding ? '/onboarding' : '/home' })
  },
  component: SignInPage,
})

function SignInPage() {
  return (
    <div className="lx-page-width-form flex min-h-dvh flex-col items-center justify-center gap-7 bg-canvas py-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-mono text-xl font-bold tracking-[-0.02em] text-text">
            locatic
          </span>
        </div>
        <p className="m-0 font-mono text-[15px] font-semibold tracking-[-0.01em] text-text">
          GitHub with a <span className="text-brand">map.</span>
        </p>
        <p className="m-0 max-w-xs font-sans text-[13.5px] leading-[1.5] text-text-muted">
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
        forceRedirectUrl="/home"
        path="/sign-in"
        routing="path"
        signInUrl="/sign-in"
        signUpForceRedirectUrl="/home"
        signUpUrl="/sign-in"
        transferable
        withSignUp
      />
    </div>
  )
}
