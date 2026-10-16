import type { ReactNode } from 'react'
import { BrandIcon } from '@/components/ui/brand-icon'
import { GITHUB_REPO_URL } from '@/lib/site-links'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const CONTACT_EMAIL = 'contact@locatic.dev'

const FOUNDERS = [
  { name: 'Saketha Rama', url: 'https://github.com/bv-saketha-rama' },
  { name: 'Avinash Changarani', url: 'https://github.com/nabobery' },
] as const

const OFFERINGS = [
  'Find developers and projects in any city in the world',
  "See what's trending in different cities",
  'Share projects and comment on them',
  "Post updates on what you're building",
  'Reach out to other builders, collaborate and maybe make a few friends',
] as const

function GithubLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 font-medium text-text underline decoration-line-strong underline-offset-4 hover:text-brand hover:decoration-brand"
    >
      <BrandIcon name="github" size={14} />
      {children}
    </a>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-eyebrow text-brand">{title}</h3>
      {children}
    </section>
  )
}

// The founders' letter. Pass a `children` trigger (landing nav), or drive it
// with `open`/`onOpenChange` from a menu item (in-app account menu).
export function AboutDialog({
  children,
  open,
  onOpenChange,
}: {
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <p className="text-eyebrow text-brand">A note from the builders</p>
          <DialogTitle className="text-headline">
            It started with a question
          </DialogTitle>
          <DialogDescription className="sr-only">
            Why we built Locatic and where we want to take it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 text-body text-text-muted">
          <div className="grid gap-3">
            <p className="font-medium text-text">Hey builders!</p>
            <p>
              Thanks for signing up. It genuinely means a lot to us, as every
              builder who joins our platform makes us believe in our vision
              more.
            </p>
            <p>
              In this note we want to tell you why we built{' '}
              <strong className="text-text">locatic</strong> and where we'd like
              to take it.
            </p>
          </div>

          <Section title="Where it came from">
            <p>
              Platforms like GitHub, Hacker News, Reddit, Discord, Product Hunt
              and Hugging Face help us discover projects and builders. As
              shipping software has become easier and models keep getting
              better, more and more interesting projects are being built around
              the world.
            </p>
            <p>
              That's when we wondered if there is a way to discover projects and
              builders in our own cities. That's where Locatic came from.
            </p>
          </Section>

          <Section title="So what is it?">
            <p>
              Locatic is a social network for developers and builders where you
              can:
            </p>
            <ul className="grid gap-1.5">
              {OFFERINGS.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand"
                  />
                  {item}
                </li>
              ))}
            </ul>
            <p>
              We took inspiration from existing social platforms but made one
              thing central to the experience:{' '}
              <strong className="text-text">where people build.</strong> It's
              exciting to discover what people are shipping in your own city.
            </p>
          </Section>

          <Section title="Who we are">
            <p>
              We're two developers who love building and discovering what others
              are building:
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {FOUNDERS.map((founder) => (
                <li key={founder.url}>
                  <GithubLink href={founder.url}>{founder.name}</GithubLink>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Where we want to take it">
            <p>
              We want Locatic to be more than a platform of projects: a place
              where builders find others working on similar things, bond over
              shared interests, or meet in person to collaborate.
            </p>
            <p>
              We want to see how the developer scene looks and evolves in
              different cities and countries. We are still early and there's a
              lot left to build, but we're aiming to become something relevant
              that helps the community grow.
            </p>
          </Section>

          <Section title="Help us grow">
            <p>
              Locatic is only as interesting as the people and projects on it.
              If you like what we're building, star the repo, share it with your
              developer friends, colleagues and communities. Got ideas or
              feedback? Write to us at{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-text underline decoration-line-strong underline-offset-4 hover:text-brand hover:decoration-brand"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            <div>
              <Button asChild variant="secondary" size="touch">
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <BrandIcon name="github" size={14} />
                  star locatic on github
                </a>
              </Button>
            </div>
          </Section>

          <div className="grid gap-1 border-t border-line pt-4">
            <p>Thanks for being here this early.</p>
            <p className="font-medium text-text">Happy building,</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <GithubLink href={FOUNDERS[0].url}>{FOUNDERS[0].name}</GithubLink>
              <span aria-hidden="true">&amp;</span>
              <GithubLink href={FOUNDERS[1].url}>{FOUNDERS[1].name}</GithubLink>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
