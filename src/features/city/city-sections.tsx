import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cardSheetClass } from '@/components/ui/card-sheet'
import { PersonRow } from '@/components/ui/person-row'
import { ProjectCard } from '@/components/ui/project-card'
import { StatusPill, isCollaborationStatus } from '@/components/ui/status-pill'
import { LxAvatar } from '@/components/ui/lx-avatar'
import { toProjectCardData } from '@/features/project-card-preview'
import { relativeTime } from '@/lib/time'
import {
  formatCityCounts,
  getCityExploreSearch,
  getEverywhereExploreSearch,
  isCityPageEmpty,
} from './copy'
import { NearbyCities } from './nearby-cities'
import type { CityPageBuilder, CityPagePayload, CityPagePost } from './types'

function CitySection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="m-0 text-title text-text">
        {title}
      </h2>
      {children}
    </section>
  )
}

function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="m-0 text-body text-text-muted">{children}</p>
}

function MoreInExplore({
  children,
  search,
}: {
  children: ReactNode
  search: ReturnType<typeof getCityExploreSearch>
}) {
  return (
    <Link
      to="/explore"
      search={search}
      className="inline-flex min-h-11 items-center self-start font-mono text-label text-text-muted"
    >
      {children}
    </Link>
  )
}

function CityHeader({ page }: { page: CityPagePayload }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="m-0 text-headline text-text">{page.city.name}</h1>
      {page.city.regionLabel && (
        <p className="m-0 text-body text-text-muted">{page.city.regionLabel}</p>
      )}
      <p className="m-0 font-mono text-meta text-text-muted">
        {formatCityCounts(page.stats)}
      </p>
    </header>
  )
}

function RecentWork({ page }: { page: CityPagePayload }) {
  const { projects, hasMore } = page.recentWork
  return (
    <CitySection id="city-recent-work" title="recent work">
      {projects.length === 0 ? (
        <SectionEmpty>no public projects here yet.</SectionEmpty>
      ) : (
        <div className={cardSheetClass}>
          {projects.map((project) => (
            <ProjectCard
              key={String(project.projectId)}
              variant="row"
              project={toProjectCardData(project)}
              authorLink={{
                username: project.authorHandle,
                search: { tab: 'projects' },
              }}
              projectLink={{ owner: project.owner, repo: project.repo }}
              showActions={false}
            />
          ))}
        </div>
      )}
      {hasMore && (
        <MoreInExplore search={getCityExploreSearch(page.city.cityId)}>
          more from {page.city.name} in explore
        </MoreInExplore>
      )}
    </CitySection>
  )
}

function BuilderRow({ builder }: { builder: CityPageBuilder }) {
  const status = isCollaborationStatus(builder.buildStatus)
    ? builder.buildStatus
    : null
  return (
    <li>
      <PersonRow
        avatarName={builder.displayName}
        avatarUrl={builder.avatarUrl}
        title={builder.displayName}
        meta={
          <>
            @{builder.githubUsername} ·{' '}
            {builder.projectsCount === 1
              ? '1 project'
              : `${builder.projectsCount} projects`}
            {builder.isNewBuilder ? ' · new builder' : ''}
          </>
        }
        action={status ? <StatusPill status={status} /> : undefined}
        renderIdentity={(content, className) => (
          <Link
            to="/u/$username"
            params={{ username: builder.githubUsername }}
            search={{ tab: 'projects' }}
            preload="intent"
            className={className}
          >
            {content}
          </Link>
        )}
      />
    </li>
  )
}

function Builders({ page }: { page: CityPagePayload }) {
  return (
    <CitySection id="city-builders" title="builders">
      <p className="m-0 font-mono text-meta text-text-muted">
        most recent public work first
      </p>
      {page.builders.length === 0 ? (
        <SectionEmpty>no builders with public profiles here yet.</SectionEmpty>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {page.builders.map((builder) => (
            <BuilderRow key={String(builder.userId)} builder={builder} />
          ))}
        </ul>
      )}
      {page.builders.length > 0 && (
        <MoreInExplore
          search={getCityExploreSearch(page.city.cityId, 'builders')}
        >
          all builders in {page.city.name}
        </MoreInExplore>
      )}
    </CitySection>
  )
}

function PostRow({ post }: { post: CityPagePost }) {
  return (
    <li className="flex gap-3 py-2">
      <LxAvatar
        name={post.author.displayName}
        avatarUrl={post.author.avatarUrl ?? undefined}
        size={32}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 font-mono text-meta text-text-muted">
          <Link
            to="/u/$username"
            params={{ username: post.author.githubUsername }}
            search={{ tab: 'projects' }}
            className="text-text"
          >
            {post.author.displayName}
          </Link>{' '}
          on{' '}
          <Link
            to="/project/$owner/$repo"
            params={{
              owner: post.project.ownerLogin,
              repo: post.project.name,
            }}
            search={{ post: String(post.postId) }}
            hash={`post-${String(post.postId)}`}
            className="text-text-muted"
          >
            {post.project.fullName}
          </Link>{' '}
          · {relativeTime(post.createdAt)}
        </p>
        <p className="m-0 line-clamp-4 whitespace-pre-line wrap-anywhere text-body text-text">
          {post.body}
        </p>
      </div>
    </li>
  )
}

function RecentPosts({ page }: { page: CityPagePayload }) {
  return (
    <CitySection id="city-recent-posts" title="recent posts">
      {page.posts.length === 0 ? (
        <SectionEmpty>no posts here yet.</SectionEmpty>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {page.posts.map((post) => (
            <PostRow key={String(post.postId)} post={post} />
          ))}
        </ul>
      )}
    </CitySection>
  )
}

/**
 * A city with nothing public yet: names the city, then offers nearby cities
 * with public work, or global Explore when there are none.
 */
function EmptyCity({ page }: { page: CityPagePayload }) {
  return (
    <CitySection
      id="city-empty"
      title={`no public work in ${page.city.name} yet.`}
    >
      {page.nearby.length > 0 ? (
        <>
          <p className="m-0 text-body text-text-muted">
            builders are sharing work in nearby cities:
          </p>
          <NearbyCities city={page.city} nearby={page.nearby} />
        </>
      ) : (
        <>
          <p className="m-0 text-body text-text-muted">
            no nearby city has public work yet either.
          </p>
          <Button asChild size="touch" className="self-start">
            <Link to="/explore" search={getEverywhereExploreSearch()}>
              browse everywhere
            </Link>
          </Button>
        </>
      )}
    </CitySection>
  )
}

/** The public city page body (plan item D5). No ranks, no leaderboards. */
export function CityPageView({ page }: { page: CityPagePayload }) {
  const empty = isCityPageEmpty(page)
  return (
    <div className="lx-page-width-feed flex flex-col gap-8">
      <CityHeader page={page} />
      {empty ? (
        <EmptyCity page={page} />
      ) : (
        <>
          <RecentWork page={page} />
          <Builders page={page} />
          <RecentPosts page={page} />
          {page.nearby.length > 0 && (
            <CitySection id="city-nearby" title="nearby cities">
              <NearbyCities city={page.city} nearby={page.nearby} />
            </CitySection>
          )}
        </>
      )}
    </div>
  )
}
