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
  'Find developers and projects in any city in the world',
  "See what's trending in different cities",
  'Share projects and comment on them',
  "Post updates on what you're building",
  'Reach out to other builders, collaborate and maybe make a few friends',
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

      <Section title="It started with a question" headingLevel={headingLevel}>
        <p>
          In today's world, we have many platforms like GitHub, Hacker News,
          Reddit, Discord, Product Hunt, Hugging Face etc. that help us discover
          projects and builders. And as shipping software has become easier and
          the models keep getting better, we continue to see more and more
          interesting projects that devs are building around the world.
        </p>
        <p>
          That's when we wondered if there was a way to discover projects and
          builders in one's city. That's where Locatic came from.
        </p>
      </Section>

      <Section title="So what is it?" headingLevel={headingLevel}>
        <p>
          Locatic is a social network for developers and builders where you can:
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
          We believe it'd be very exciting and inspiring to discover what kind
          of projects people are shipping in your own city.
        </p>
      </Section>

      <Section title="Who we are" headingLevel={headingLevel}>
        <p>
          We're two developers who love building and discovering what others are
          building as well:
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
          We want Locatic to be more than just a platform of projects. We'd love
          it to become a place where builders can find others working on similar
          projects, bond over shared interests or potentially meet in person for
          a collab.
        </p>
        <p>
          We wanna see how the developer scene looks and evolves in different
          cities and countries. That's what we're aiming for. We are still early
          and there's a lot left to build, but we wanna aim for this ambition
          and become something relevant that helps the community grow.
        </p>
      </Section>

      <Section title="Help us grow" headingLevel={headingLevel}>
        <p>
          Locatic is only as interesting as the people and projects on it. The
          more builders join and share their projects, the more there is for
          everyone to discover.
        </p>
        <p>
          If you like what we're building, please follow us on GitHub and share
          it with your developer friends, colleagues and communities. And if you
          have ideas, feedback or something you want to see on the platform,
          write to us at{' '}
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
