import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import type { LandingMap } from './landing-content'

/**
 * The hero globe in words (plan item D7). The globe itself is decorative, so
 * this line carries its content: the busiest cities with builders as links to
 * their pages, or, while too few cities have builders, a plain statement that
 * the pins are an example.
 */
export function HeroMapCaption({
  map,
  id,
}: {
  map: LandingMap
  /** For `aria-describedby` on the map's region. */
  id?: string
}) {
  if (map.kind === 'example') {
    return (
      <p
        id={id}
        className="lx-hero-up mt-6 mb-0 flex flex-wrap items-center gap-2 font-mono text-label text-text-muted [--hero-step:5]"
      >
        <span className="rounded-control border border-line-strong px-1.5 py-0.5 text-meta">
          example
        </span>
        the map pins are illustrative until more cities have builders
      </p>
    )
  }

  const moreCount = map.cityCount - map.featured.length

  return (
    <p
      id={id}
      className="lx-hero-up mt-6 mb-0 font-mono text-label text-text-muted [--hero-step:5]"
    >
      on the map: builders in{' '}
      {map.featured.map((city, index) => (
        <Fragment key={city.slug}>
          {index > 0 && ', '}
          <Link
            to="/c/$slug"
            params={{ slug: city.slug }}
            className="text-text underline decoration-line-strong underline-offset-4 hover:decoration-text"
          >
            {city.name}
          </Link>
        </Fragment>
      ))}
      {moreCount > 0 &&
        ` and ${moreCount} more ${moreCount === 1 ? 'city' : 'cities'}`}
    </p>
  )
}
