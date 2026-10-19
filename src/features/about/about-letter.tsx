import type { ReactNode } from 'react'
import { BrandIcon } from '@/components/ui/brand-icon'
import { Button } from '@/components/ui/button'
import {
  CONTACT_EMAIL,
  FOUNDERS,
  githubProfileUrl,
} from '@/features/about/about-content'
import { GITHUB_URL } from '@/lib/site-links'

const OFFERINGS = [
  'Discover projects and builders in your city or explore other cities',
  'Keep up with recent projects, releases and posts',
  'Share public GitHub projects and post updates on your work',
  'Follow builders and join discussions in the comments',
  'Message other builders about their work or a possible collaboration',
] as const

const inlineLinkClassName =
  'font-medium text-text underline decoration-line-strong underline-offset-4 hover:text-brand hover:decoration-brand'

function GithubLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center gap-1.5 ${inlineLinkClassName}`}
    >
      <BrandIcon name="github" size={14} />
      {children}
    </a>
  )
}

type HeadingLevel = 'h2' | 'h3'

function Section({
  title,
  headingLevel: Heading,
  children,
}: {
  title: string
  headingLevel: HeadingLevel
  children: ReactNode
}) {
  return (
    <section className="grid gap-2">
      <Heading className="text-eyebrow text-brand">{title}</Heading>
      {children}
    </section>
  )
}

/**
 * The founders' letter, shared by /about and the in-app about dialog. Its
 * section headings sit one level under the host's title: `h2` on the page,
 * `h3` in the dialog. `opener` adds host-specific lines after the greeting
 * (the dialog thanks members for signing up; /about readers may not have).
 */
export function AboutLetter({
  headingLevel,
  opener,
}: {
  headingLevel: HeadingLevel
  opener?: ReactNode
}) {
  return (
    <div className="grid gap-5 text-body text-text-muted">
      <div className="grid gap-3">
        <p className="font-medium text-text">Hey builders!</p>
        {opener}
      </div>

      <Section title="Where it came from" headingLevel={headingLevel}>
        <p>
          We love discovering projects online. But we kept wondering who was
          building things in our own cities.
        </p>
        <p>
          We built Locatic to find out. We believe it's exciting and inspiring
          to discover what people are building in your own city.
        </p>
      </Section>

      <Section title="So what is it?" headingLevel={headingLevel}>
        <p>
          Locatic is a social network for developers to discover projects and
          builders by city. You can:
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
      </Section>

      <Section title="Who we are" headingLevel={headingLevel}>
        <p>
          We're two developers who enjoy making software and seeing what other
          people build:
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {FOUNDERS.map((founder) => (
            <li key={founder.github}>
              <GithubLink href={githubProfileUrl(founder.github)}>
                {founder.name}
              </GithubLink>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Where we want to take it" headingLevel={headingLevel}>
        <p>
          We hope the projects you find here lead to conversations,
          collaborations and friendships, including with people you can meet in
          person.
        </p>
      </Section>

      <Section title="Help us grow" headingLevel={headingLevel}>
        <p>
          Share Locatic with a friend who's building something. Follow us on
          GitHub, or send ideas and feedback to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className={inlineLinkClassName}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <div>
          <Button asChild variant="secondary" size="touch">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
              <BrandIcon name="github" size={14} />
              follow locatic on github
            </a>
          </Button>
        </div>
      </Section>

      <div className="grid gap-1 border-t border-line pt-4">
        <p>Thanks for being here this early.</p>
        <p className="font-medium text-text">Happy building,</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <GithubLink href={githubProfileUrl(FOUNDERS[0].github)}>
            {FOUNDERS[0].name}
          </GithubLink>
          <span aria-hidden="true">&amp;</span>
          <GithubLink href={githubProfileUrl(FOUNDERS[1].github)}>
            {FOUNDERS[1].name}
          </GithubLink>
        </p>
      </div>
    </div>
  )
}
