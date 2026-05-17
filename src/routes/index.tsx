import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Logo } from '@/components/ui/logo'
import { DotMap } from '@/components/ui/dot-map'
import { BrandIcon } from '@/components/ui/brand-icon'
import { ArrowRight, Star, Heart, MessageSquare, MapPin } from '@/lib/icons'
import { viewerQueryOptions } from '@/features/viewer/queries'
import type { ViewerBootstrapPayload } from '@/features/contracts'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isAuthenticated) {
      return
    }

    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload

    throw redirect({ to: bootstrap.needsOnboarding ? '/onboarding' : '/home' })
  },
  component: LandingPage,
})

function LandingPage() {
  return (
    <div
      className="overflow-x-clip"
      style={{
        minHeight: '100dvh',
        background: 'var(--lx-bg)',
        color: 'var(--lx-text)',
        position: 'relative',
      }}
    >
      {/* Nav */}
      <header
        style={{
          minHeight: 64,
          padding: '16px var(--lx-gutter)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          position: 'relative',
          zIndex: 2,
          borderBottom: '1px solid var(--lx-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={24} />
          <span
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            locatic
          </span>
          <span
            style={{
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 10.5,
              color: 'var(--lx-text-3)',
              marginLeft: 4,
              padding: '2px 6px',
              border: '1px solid var(--lx-border)',
              borderRadius: 3,
              lineHeight: 1,
            }}
          >
            v0.1 · beta
          </span>
        </div>
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            fontFamily: 'var(--lx-font-mono)',
            fontSize: 12.5,
            color: 'var(--lx-text-2)',
          }}
        >
          <a
            href="https://github.com"
            style={{ color: 'inherit', textDecoration: 'none' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            github
          </a>
          <Link
            to="/sign-in"
            style={{
              border: '1px solid var(--lx-border)',
              background: 'var(--lx-surface)',
              color: 'var(--lx-text)',
              padding: '7px 14px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 12.5,
              textDecoration: 'none',
            }}
          >
            sign in
          </Link>
        </nav>
      </header>

      {/* Dot map background */}
      <div
        style={{
          position: 'absolute',
          top: 64,
          left: 0,
          right: 0,
          height: 520,
          display: 'flex',
          justifyContent: 'center',
          opacity: 0.6,
          pointerEvents: 'none',
          maskImage:
            'radial-gradient(ellipse at center, black 40%, transparent 75%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 40%, transparent 75%)',
        }}
      >
        <DotMap width={1200} height={520} />
      </div>

      {/* Hero */}
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          padding: '48px var(--lx-gutter) 0',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 32,
          alignItems: 'center',
          maxWidth: 'var(--lx-public-max)',
          margin: '0 auto',
        }}
      >
        <div>
          {/* Status badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 11px 5px 8px',
              borderRadius: 999,
              border: '1px solid var(--lx-border)',
              background: 'var(--lx-surface)',
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 11.5,
              color: 'var(--lx-text-2)',
              marginBottom: 28,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--lx-accent)',
                boxShadow: '0 0 0 3px oklch(72% 0.17 185 / 0.25)',
              }}
            />
            <span>1,284 builders shipping in 47 cities</span>
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 'clamp(56px, 7vw, 88px)',
              fontWeight: 700,
              lineHeight: 0.96,
              letterSpacing: '-0.045em',
              color: 'var(--lx-text)',
            }}
          >
            GitHub
            <br />
            with a <span style={{ color: 'var(--lx-accent)' }}>map.</span>
          </h1>

          <p
            style={{
              margin: '28px 0 0',
              maxWidth: 460,
              fontFamily: 'var(--lx-font-sans)',
              fontSize: 17,
              lineHeight: 1.55,
              color: 'var(--lx-text-2)',
            }}
          >
            Discover what developers in your city are building. Like their
            projects. Star their repos. Follow the builders.
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 36,
              flexWrap: 'wrap',
            }}
          >
            <Link
              to="/sign-in"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 22px',
                background: 'var(--lx-accent)',
                color: '#0d1117',
                border: 'none',
                borderRadius: 5,
                cursor: 'pointer',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 13.5,
                fontWeight: 600,
                textDecoration: 'none',
                minHeight: 44,
              }}
            >
              <BrandIcon name="github" size={16} />
              Sign in with GitHub
            </Link>
            <button
              style={{
                padding: '14px 18px',
                background: 'transparent',
                color: 'var(--lx-text-2)',
                border: '1px solid var(--lx-border)',
                borderRadius: 5,
                cursor: 'pointer',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 13.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
              }}
              onClick={() =>
                document
                  .getElementById('features')
                  ?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              browse the feed <ArrowRight size={14} />
            </button>
          </div>

          <div
            style={{
              marginTop: 20,
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 11.5,
              color: 'var(--lx-text-3)',
            }}
          >
            free · no spam · only public repo scope required
          </div>
        </div>

        {/* Preview card float */}
        <div style={{ position: 'relative', height: 320 }}>
          <div
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              right: -12,
              height: 180,
              borderRadius: 6,
              background: 'var(--lx-surface)',
              border: '1px solid var(--lx-border)',
              opacity: 0.4,
              transform: 'rotate(2.5deg)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 36,
              left: 0,
              right: 0,
              transform: 'rotate(-1.5deg)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
              borderRadius: 6,
              background: 'var(--lx-surface)',
              border: '1px solid var(--lx-border)',
              padding: '18px 20px',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 14.5,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              <span style={{ color: 'var(--lx-text-3)', fontWeight: 400 }}>
                sonia/
              </span>
              wisp.tsx
            </div>
            <p
              style={{
                margin: '0 0 12px',
                fontFamily: 'var(--lx-font-sans)',
                fontSize: 13,
                color: 'var(--lx-text-2)',
                lineHeight: 1.5,
              }}
            >
              Tiny React state primitive — signals without the ceremony.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 16,
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 11.5,
                color: 'var(--lx-text-3)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Star size={11} strokeWidth={1.4} /> 8.1k
              </span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  color: 'var(--lx-accent)',
                }}
              >
                <Heart size={11} fill="currentColor" strokeWidth={1.4} /> 612
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MessageSquare size={11} strokeWidth={1.4} /> 48
              </span>
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 24,
              background: 'var(--lx-surface)',
              border: '1px solid var(--lx-border)',
              borderRadius: 4,
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'var(--lx-font-mono)',
              fontSize: 11,
              color: 'var(--lx-accent)',
              transform: 'rotate(4deg)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            <Heart size={11} fill="currentColor" /> +12
          </div>
        </div>
      </section>

      {/* Feature row */}
      <section
        id="features"
        style={{
          position: 'relative',
          zIndex: 1,
          margin: '64px var(--lx-gutter) 0',
          padding: '40px 0',
          borderTop: '1px solid var(--lx-border)',
          borderBottom: '1px solid var(--lx-border)',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 20,
          maxWidth: 1184,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        {[
          {
            num: '01',
            title: 'discover',
            desc: 'See projects shipped by people in your city, your stack, your tier of weird.',
            Icon: MapPin,
          },
          {
            num: '02',
            title: 'like & star',
            desc: 'A heart for taste, a star for code. Both signals matter — they go to different places.',
            Icon: Heart,
          },
          {
            num: '03',
            title: 'connect',
            desc: 'Follow builders whose work you admire. Their next push shows up at the top of your feed.',
            Icon: ArrowRight,
          },
        ].map((f, i) => (
          <div
            key={i}
            style={{
              padding: '8px 0',
              borderLeft: 'none',
              borderTop: i > 0 ? '1px solid var(--lx-border)' : 'none',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 11,
                color: 'var(--lx-text-3)',
                marginBottom: 14,
              }}
            >
              {f.num}
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 4,
                border: '1px solid var(--lx-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--lx-accent)',
                marginBottom: 14,
              }}
            >
              <f.Icon size={18} strokeWidth={1.4} />
            </div>
            <h3
              style={{
                margin: '0 0 8px',
                fontFamily: 'var(--lx-font-mono)',
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--lx-text)',
                letterSpacing: '-0.01em',
              }}
            >
              {f.title}
            </h3>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--lx-font-sans)',
                fontSize: 14,
                color: 'var(--lx-text-2)',
                lineHeight: 1.55,
                maxWidth: 280,
              }}
            >
              {f.desc}
            </p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: '28px var(--lx-gutter)',
          textAlign: 'center',
          fontFamily: 'var(--lx-font-mono)',
          fontSize: 11.5,
          color: 'var(--lx-text-3)',
        }}
      >
        <div>built with love for developers.</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>
          locatic · {new Date().getFullYear()} · made in 7 cities
        </div>
      </footer>
      <style>{`
        @media (min-width: 900px) {
          #features {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0;
          }

          #features > div {
            padding: 8px 32px;
            border-top: none;
          }

          #features > div:not(:first-child) {
            border-left: 1px solid var(--lx-border);
          }
        }

        @media (min-width: 980px) {
          section[style*='max-width: var(--lx-public-max)'] {
            grid-template-columns: minmax(0, 1fr) 420px;
            gap: 48px;
            padding-top: 80px;
          }
        }
      `}</style>
    </div>
  )
}
