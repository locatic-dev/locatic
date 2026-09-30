import { createFileRoute } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { PageHeader } from '@/components/app-shell/page-header'
import { Button } from '@/components/ui/button'
import { cardSheetClass } from '@/components/ui/card-sheet'
import { EmptyState } from '@/components/ui/empty-state'
import { ProjectCard } from '@/components/ui/project-card'
import { Skeleton } from '@/components/ui/skeleton'
import { getFreshExploreSearch } from '@/features/explore/state'
import { toProjectCardData } from '@/features/project-card-preview'
import {
  SAVED_PAGE_SIZE,
  useProjectSaveToggle,
} from '@/features/projects/saves'
import { Bookmark } from '@/lib/icons'

export const Route = createFileRoute('/_app/saved')({
  component: SavedPage,
})

/** The viewer's private saved projects, most recently saved first (D1). */
function SavedPage() {
  const navigate = Route.useNavigate()
  const saved = usePaginatedQuery(
    api.projects.listSaved,
    {},
    { initialNumItems: SAVED_PAGE_SIZE },
  )
  const saveToggle = useProjectSaveToggle()
  const entries = saved.results

  return (
    <div className="lx-page-shell">
      <PageHeader title="saved" subtitle="only you can see this list" />

      <div className="lx-page-scroll flex-1">
        <div className="lx-page-width-feed flex flex-col gap-2">
          {saved.status === 'LoadingFirstPage' && (
            <div role="status" className="flex flex-col gap-2">
              <span className="sr-only">loading saved projects</span>
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-36 w-full rounded-card" />
              ))}
            </div>
          )}

          {saved.status === 'Exhausted' && entries.length === 0 && (
            <EmptyState
              icon={<Bookmark size={32} strokeWidth={1.2} />}
              title="nothing saved yet"
              description="use save on any project to keep it here."
              action={{
                label: 'browse explore',
                onClick: () =>
                  void navigate({
                    to: '/explore',
                    search: getFreshExploreSearch(),
                  }),
              }}
            />
          )}

          {entries.length > 0 && (
            <div className={cardSheetClass}>
              {entries.map((entry) => {
                const { project } = entry
                return (
                  <ProjectCard
                    key={String(project.projectId)}
                    variant="row"
                    project={toProjectCardData(project)}
                    authorLink={{ username: project.authorHandle }}
                    projectLink={{ owner: project.owner, repo: project.repo }}
                    saved
                    savePending={saveToggle.isPending(project.projectId)}
                    onToggleSave={() =>
                      void saveToggle.toggle({
                        projectId: project.projectId,
                        projectName: project.fullName,
                        saved: true,
                      })
                    }
                  />
                )
              })}
            </div>
          )}

          {(saved.status === 'CanLoadMore' ||
            saved.status === 'LoadingMore') && (
            <div className="py-5 text-center">
              <Button
                size="meta"
                onClick={() => saved.loadMore(SAVED_PAGE_SIZE)}
                disabled={saved.status === 'LoadingMore'}
              >
                {saved.status === 'LoadingMore' ? 'loading…' : 'load more'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
