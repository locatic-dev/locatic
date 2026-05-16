import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/react'
import { Logo } from '@/components/ui/logo'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--lx-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        padding: '32px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Logo size={28} />
        <span
          style={{
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--lx-text)',
          }}
        >
          locatic
        </span>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: 'w-full max-w-sm',
            card: 'bg-[var(--lx-surface)] border border-[var(--lx-border)] shadow-none rounded-md',
            headerTitle: 'font-mono text-[var(--lx-text)]',
            headerSubtitle: 'text-[var(--lx-text-2)]',
            socialButtonsBlockButton:
              'border-[var(--lx-border)] bg-[var(--lx-surface-alt)] text-[var(--lx-text)] hover:bg-[var(--lx-border)]',
            formButtonPrimary:
              'bg-[var(--lx-accent)] text-[#0d1117] font-mono font-semibold hover:opacity-90',
            formFieldInput:
              'bg-[var(--lx-bg)] border-[var(--lx-border)] text-[var(--lx-text)] font-mono',
            footerActionLink: 'text-[var(--lx-accent)]',
          },
        }}
        forceRedirectUrl="/home"
        signUpForceRedirectUrl="/home"
      />
    </div>
  )
}
