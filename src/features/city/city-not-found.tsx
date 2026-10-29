import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { getFreshExploreSearch } from '@/features/explore/state'

/** Unknown or inactive city (served with a 404). */
export function CityNotFoundContent() {
  return (
    <div className="lx-page-width-feed flex flex-col items-start gap-3 py-4">
      <h1 className="m-0 text-headline text-text">city not found</h1>
      <p className="m-0 text-body text-text-muted">
        there is no city page at this address.
      </p>
      <Button asChild size="touch">
        <Link to="/explore" search={getFreshExploreSearch()}>
          go to explore
        </Link>
      </Button>
    </div>
  )
}
