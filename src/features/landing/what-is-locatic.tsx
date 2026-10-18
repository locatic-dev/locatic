import { Link } from '@tanstack/react-router'
import { LOCATIC_DEFINITION } from '@/features/about/about-content'

// The plain definition under the features: the one passage search snippets
// and AI answers should quote, worded as on /about.
export function WhatIsLocatic() {
  return (
    <section
      aria-labelledby="what-is-locatic"
      className="mx-auto mt-16 max-w-(--lx-public-max) px-(--lx-gutter) pb-16 md:mt-20 md:pb-24"
    >
      <div className="grid max-w-(--lx-form-max) gap-3">
        <h2 id="what-is-locatic" className="text-title text-text">
          what is locatic?
        </h2>
        <p className="text-body text-text-muted">{LOCATIC_DEFINITION}</p>
        <p className="font-mono text-label">
          <Link
            to="/about"
            className="inline-flex min-h-11 items-center text-brand no-underline hover:text-text"
          >
            read more about locatic →
          </Link>
        </p>
      </div>
    </section>
  )
}
