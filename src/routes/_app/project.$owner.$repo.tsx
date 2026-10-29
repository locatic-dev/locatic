import { useSuspenseQuery } from '@tanstack/react-query'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import {
  moreFromOwnerCityQueryOptions,
  projectDetailQueryOptions,
  projectSignalsQueryOptions,
} from '@/features/projects/queries'
import {
  mapProjectDetail,
  type ProjectDetailPayload,
} from '@/features/contracts'
import { ProjectView } from '@/features/projects/project-view'
import { ProjectNotFound } from '@/features/projects/project-not-found'
import {
  ProjectRoutePending,
  ROUTE_PENDING_MIN_MS,
  ROUTE_PENDING_MS,
} from '@/components/app-shell/route-pending'
import { normalizeProjectSearchParam } from '@/features/projects/deep-link'
import { notFoundSeo, seo, truncateDescription } from '@/lib/seo'
import { projectNodes, type ProjectStructuredData } from '@/lib/structured-data'
import { JsonLd } from '@/components/ui/json-ld'

/** Deep-link search: each key optional for links, always set by validation. */
type ProjectSearch = {
  comment?: string
  commentPath?: string
  post?: string
  release?: string
  thread?: string
}

export const Route = createFileRoute('/_app/project/$owner/$repo')({
  validateSearch: (search: Record<string, unknown>): ProjectSearch => {
    const comment = normalizeProjectSearchParam(search.comment)
    const commentPath = normalizeProjectSearchParam(search.commentPath)
    const post = normalizeProjectSearchParam(search.post)
    const release = normalizeProjectSearchParam(search.release)
    const thread = normalizeProjectSearchParam(search.thread)

    // Every key is set, even when invalid: the router merges the raw URL
    // search under this result, so an omitted key would let a raw value in.
    return {
      comment: comment ?? undefined,
      commentPath: commentPath ?? undefined,
      post: post ?? undefined,
      release: release ?? undefined,
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
        release?: string
        thread?: string
      }
      const comment = normalizeProjectSearchParam(search.comment)
      const commentPath = normalizeProjectSearchParam(search.commentPath)
      const post = normalizeProjectSearchParam(search.post)
      const release = normalizeProjectSearchParam(search.release)
      const thread = normalizeProjectSearchParam(search.thread)
      // Permanent: the stored owner/repo is the canonical address (renamed
      // repositories, letter case).
      throw redirect({
        hash: location.hash,
        params: canonicalRoute,
        statusCode: 301,
        search: {
          ...(comment ? { comment } : {}),
          ...(commentPath ? { commentPath } : {}),
          ...(post ? { post } : {}),
          ...(release ? { release } : {}),
          ...(thread ? { thread } : {}),
        },
        to: '/project/$owner/$repo',
      })
    }

    // Rendered on the server so crawlers see the owner's city link and the
    // "more from {city}" projects. prefetchQuery never throws: a failure
    // leaves both to load on the client.
    await Promise.all([
      context.queryClient.prefetchQuery(
        projectSignalsQueryOptions(detail.project._id),
      ),
      context.queryClient.prefetchQuery(
        moreFromOwnerCityQueryOptions(detail.project._id),
      ),
    ])

    // The signals carry the owner's disclosed location (exact city only).
    const signals = context.queryClient.getQueryData(
      projectSignalsQueryOptions(detail.project._id).queryKey,
    ) as FunctionReturnType<typeof api.projects.getProjectSignals> | undefined
    const ownerLocation = signals?.ownerLocation

    return {
      structuredData: {
        owner: params.owner,
        repo: params.repo,
        fullName: detail.project.github.fullName,
        description: detail.project.github.description,
        primaryLanguage: detail.project.github.primaryLanguage,
        topics: detail.project.github.topics,
        lastCommitAt: detail.project.github.lastCommitAt,
        ownerName: detail.owner.displayName,
        ownerUsername: detail.owner.githubUsername,
        // The slug check also covers a backend deployed before `citySlug`.
        city:
          ownerLocation?.kind === 'city' && ownerLocation.citySlug
            ? { name: ownerLocation.cityName, slug: ownerLocation.citySlug }
            : null,
      } satisfies ProjectStructuredData,
    }
  },
  // The root head sees a stale matches snapshot, so this route reports its
  // own notFoundComponent from its fresh match.
  head: ({ match, loaderData }) =>
    match.status === 'notFound'
      ? notFoundSeo()
      : loaderData
        ? projectHead(loaderData.structuredData)
        : {},
  pendingComponent: ProjectRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  notFoundComponent: ProjectNotFound,
  component: ProjectDetailPage,
})

function projectHead(project: ProjectStructuredData) {
  return seo({
    title: project.fullName,
    description: truncateDescription(
      project.description ||
        `${project.fullName} by ${project.ownerName} on Locatic: releases, posts and discussion.`,
    ),
    path: `/project/${project.owner}/${project.repo}`,
  })
}

// Resolves the project before any view hooks run. The loader already 404s;
// this return covers a project that disappears or turns private while the page
// is mounted, and keeping it here, not inside ProjectView, keeps ProjectView's
// hook order stable.
function ProjectDetailPage() {
  const { owner, repo } = Route.useParams()
  const { structuredData } = Route.useLoaderData()
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
    <>
      <ProjectView
        key={String(detail.project._id)}
        detail={detail}
        owner={owner}
        repo={repo}
      />
      <JsonLd nodes={projectNodes(structuredData)} />
    </>
  )
}
