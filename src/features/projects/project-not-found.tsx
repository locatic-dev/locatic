import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  mapViewerBootstrap,
  type ViewerBootstrapPayload,
} from '@/features/contracts'
import { getFreshExploreSearch } from '@/features/explore/state'
import { viewerQueryOptions } from '@/features/viewer/queries'

export function ProjectNotFound() {
  // MemberShell provides the main landmark for signed-in viewers.
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
      <h1 className="m-0 text-headline text-text">project not found</h1>
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
