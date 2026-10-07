import { Fragment } from 'react'
import { Link } from '@tanstack/react-router'
import type { LandingMap } from './landing-content'

const linkClass =
  'text-text underline decoration-line-strong underline-offset-4 hover:decoration-text'

/**
 * The hero globe in words (plan item D7). The globe itself is decorative, so
 * this carries its content: the busiest cities with builders, as links to
 * their pages. While the map shows no real cities, it renders nothing.
 */
export function HeroMapCaption({
  map,
  id,
}: {
  map: LandingMap
  /** For `aria-describedby` on the map's region. */
  id?: string
}) {
  if (map.kind !== 'cities') {
    return null
  }

  return (
    <div
      id={id}
      className="lx-hero-up mt-6 font-mono text-label text-text-muted [--hero-step:5]"
    >
      <CityLine map={map} />
    </div>
  )
}

function CityLine({ map }: { map: Extract<LandingMap, { kind: 'cities' }> }) {
  const moreCount = map.cityCount - map.featured.length
  return (
    <p className="m-0">
      on the map: builders in{' '}
      {map.featured.map((city, index) => (
        <Fragment key={city.slug}>
          {index > 0 && ', '}
          <Link
            to="/c/$slug"
            params={{ slug: city.slug }}
            className={linkClass}
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
