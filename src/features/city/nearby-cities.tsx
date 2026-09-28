import { Link } from '@tanstack/react-router'
import { DotMap } from '@/components/ui/dot-map'
import { describeNearbyMap, formatCityCounts } from './copy'
import type { CityPagePayload } from './types'

/**
 * The one map surface (plan item D5): the city and its nearby active cities
 * on the dot map, and the same cities as a list of links. Renders nothing
 * when no nearby city has activity.
 */
export function NearbyCities({
  city,
  nearby,
}: Pick<CityPagePayload, 'city' | 'nearby'>) {
  if (nearby.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <DotMap
        width={430}
        height={150}
        className="h-auto w-full max-w-120"
        focus={{ id: city.slug, ...city.location }}
        points={nearby.map((nearbyCity) => ({
          id: nearbyCity.slug,
          ...nearbyCity.location,
        }))}
        label={describeNearbyMap(city.name, nearby.length)}
      />
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {nearby.map((nearbyCity) => (
          <li key={nearbyCity.cityId}>
            <Link
              to="/c/$slug"
              params={{ slug: nearbyCity.slug }}
              className="flex min-h-11 flex-col justify-center rounded-control py-1 no-underline"
            >
              <span className="text-body text-text">
                {nearbyCity.name}
                {nearbyCity.regionLabel && (
                  <span className="text-text-muted">
                    , {nearbyCity.regionLabel}
                  </span>
                )}
              </span>
              <span className="font-mono text-meta text-text-faint">
                {formatCityCounts(nearbyCity)} · {nearbyCity.distanceKm} km away
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
