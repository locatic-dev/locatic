import { Link } from '@tanstack/react-router'

import { ProfileSection } from '@/features/profile/profile-sections'
import type { ProfileShippingLogEntry } from '@/features/profile/types'
import { formatDate } from '@/lib/time'

const projectLinkClassName =
  'rounded-sm font-mono text-label text-text-muted underline-offset-2 transition-colors hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

/**
 * Dated releases and posts across the builder's public projects, newest
 * first (plan item D6). Renders nothing when there is nothing to list, so a
 * profile without releases or posts shows no empty block.
 */
export function ProfileShippingLog({
  entries,
}: {
  entries: ProfileShippingLogEntry[]
}) {
  if (entries.length === 0) {
    return null
  }

  const ordered = [...entries].sort((left, right) => right.at - left.at)

  return (
    <ProfileSection
      id="profile-shipping-log"
      title="shipping log"
      description="releases and posts, newest first"
    >
      <ol className="m-0 flex list-none flex-col divide-y divide-line p-0">
        {ordered.map((entry) => (
          <li
            key={`${entry.kind}:${entry.id}`}
            className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:gap-4"
          >
            <time
              dateTime={new Date(entry.at).toISOString()}
              className="shrink-0 font-mono text-meta text-text-faint tabular-nums sm:w-28 sm:pt-0.5"
            >
              {formatDate(entry.at)}
            </time>
            <ShippingLogEntryBody entry={entry} />
          </li>
        ))}
      </ol>
    </ProfileSection>
  )
}

function ShippingLogEntryBody({ entry }: { entry: ProfileShippingLogEntry }) {
  const params = { owner: entry.project.owner, repo: entry.project.repo }

  if (entry.kind === 'release') {
    return (
      <p className="m-0 min-w-0 text-body text-text wrap-anywhere">
        released <span className="font-semibold">{entry.title}</span>
        {' · '}
        <Link
          to="/project/$owner/$repo"
          params={params}
          className={projectLinkClassName}
        >
          {entry.project.fullName}
        </Link>
      </p>
    )
  }

  return (
    <div className="min-w-0">
      <p className="m-0 text-body text-text">
        posted on{' '}
        <Link
          to="/project/$owner/$repo"
          params={params}
          search={{ post: entry.id }}
          hash={`post-${entry.id}`}
          className={projectLinkClassName}
        >
          {entry.project.fullName}
        </Link>
      </p>
      <p className="m-0 mt-0.5 line-clamp-2 text-body text-text-muted wrap-anywhere">
        {entry.excerpt}
      </p>
    </div>
  )
}
