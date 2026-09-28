import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import {
  Link,
  createFileRoute,
  notFound,
  redirect,
} from '@tanstack/react-router'
import {
  projectDetailQueryOptions,
  projectSignalsQueryOptions,
} from '@/features/projects/queries'
import {
  mapProjectDetail,
  mapViewerBootstrap,
  type ProjectDetailPayload,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { ProjectView } from '@/features/projects/project-view'
import {
  ProjectRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { normalizeProjectSearchParam } from '@/features/projects/deep-link'
import { getFreshExploreSearch } from '@/features/explore/state'
import { viewerQueryOptions } from '@/features/viewer/queries'

/** Deep-link search: each key optional for links, always set by validation. */
type ProjectSearch = {
  comment?: string
  commentPath?: string
  post?: string
  thread?: string
}

export const Route = createFileRoute('/_app/project/$owner/$repo')({
  validateSearch: (search: Record<string, unknown>): ProjectSearch => {
    const comment = normalizeProjectSearchParam(search.comment)
    const commentPath = normalizeProjectSearchParam(search.commentPath)
    const post = normalizeProjectSearchParam(search.post)
    const thread = normalizeProjectSearchParam(search.thread)

    // Every key is set, even when invalid: the router merges the raw URL
    // search under this result, so an omitted key would let a raw value in.
    return {
      comment: comment ?? undefined,
      commentPath: commentPath ?? undefined,
      post: post ?? undefined,
      thread: thread ?? undefined,
    }
  },
  loader: async ({ context, location, params }) => {
    const payload = await context.queryClient.ensureQueryData(
      projectDetailQueryOptions({
        owner: params.owner,
        repo: params.repo,
      }),
    )

    const detail = payload as ProjectDetailPayload | null | undefined
    // Missing and non-public projects are a real 404, not an empty 200 page.
    if (!detail) {
      throw notFound()
    }
    // Header freshness and the owner's retry control; not worth blocking on.
    void context.queryClient.prefetchQuery(
      projectSignalsQueryOptions(detail.project._id),
    )

    const canonicalRoute = detail.canonicalRoute
    if (
      canonicalRoute &&
      (canonicalRoute.owner !== params.owner ||
        canonicalRoute.repo !== params.repo)
    ) {
      const search = location.search as {
        comment?: string | null
        commentPath?: string
        post?: string
        thread?: string
      }
      const comment = normalizeProjectSearchParam(search.comment)
      const commentPath = normalizeProjectSearchParam(search.commentPath)
      const post = normalizeProjectSearchParam(search.post)
      const thread = normalizeProjectSearchParam(search.thread)
      throw redirect({
        hash: location.hash,
        params: canonicalRoute,
        search: {
          ...(comment ? { comment } : {}),
          ...(commentPath ? { commentPath } : {}),
          ...(post ? { post } : {}),
          ...(thread ? { thread } : {}),
        },
        to: '/project/$owner/$repo',
      })
    }
  },
  pendingComponent: ProjectRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  notFoundComponent: ProjectNotFound,
  component: ProjectDetailPage,
})

function ProjectNotFound() {
  // Signed-in viewers see this inside the app shell, which already renders
  // <main id="main-content">; signed-out viewers get no shell, so this view
  // provides the landmark itself (the same signal ProjectView uses).
  const viewerQuery = useQuery(viewerQueryOptions())
  const rendersInAppShell = Boolean(
    mapViewerBootstrap(viewerQuery.data as ViewerBootstrapPayload | undefined)
      ?.viewer,
  )
  const RootElement = rendersInAppShell ? 'div' : 'main'

  return (
    <RootElement
      id={rendersInAppShell ? undefined : 'main-content'}
      tabIndex={rendersInAppShell ? undefined : -1}
      className="flex flex-col items-start gap-3 bg-canvas px-(--lx-gutter) py-10"
    >
      <h1 className="m-0 font-mono text-xl font-semibold tracking-[-0.02em] text-text">
        project not found
      </h1>
      <p className="m-0 font-sans text-sm leading-6 text-text-muted">
        this project doesn&apos;t exist or isn&apos;t public.
      </p>
      <Link
        to="/explore"
        search={getFreshExploreSearch()}
        className="inline-flex min-h-11 items-center font-mono text-label text-brand no-underline"
      >
        explore projects
      </Link>
    </RootElement>
  )
}

// Resolves the project before any view hooks run. The loader already 404s;
// this return covers a project that disappears or turns private while the page
// is mounted, and keeping it here, not inside ProjectView, keeps ProjectView's
// hook order stable.
function ProjectDetailPage() {
  const { owner, repo } = Route.useParams()
  const { data } = useSuspenseQuery(projectDetailQueryOptions({ owner, repo }))
  const detail = mapProjectDetail(
    data as ProjectDetailPayload | null | undefined,
  )

  if (!detail) {
    return <ProjectNotFound />
  }

  // Keyed by project: following "more from {city}" to another project mounts a
  // fresh view, so comment drafts, open threads and tabs never carry over.
  return (
    <ProjectView
      key={String(detail.project._id)}
      detail={detail}
      owner={owner}
      repo={repo}
    />
  )
}
