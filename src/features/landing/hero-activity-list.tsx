import { Link } from '@tanstack/react-router'
import type { PingItem } from './landing-content'

/**
 * The globe's activity as plain links. Its cards move on their
 * own inside the decorative layer, so keyboards and screen readers reach the
 * same items, and where they lead, here: a stable list, visually hidden until
 * a link in it has focus, then shown in place below the globe.
 */
export function HeroActivityList({
  items,
}: {
  items: ReadonlyArray<PingItem>
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="sr-only focus-within:not-sr-only focus-within:mt-4">
      <ul
        aria-label="recent activity"
        className="m-0 list-none space-y-1 p-0 font-mono text-label text-text-muted"
      >
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to="/project/$owner/$repo"
              params={{ owner: item.link.owner, repo: item.link.repo }}
              search={item.link.search}
              className="text-text underline decoration-line-strong underline-offset-4 hover:decoration-text"
            >
              {item.headline}
            </Link>
            {` · ${item.place}`}
          </li>
        ))}
      </ul>
    </div>
  )
}
