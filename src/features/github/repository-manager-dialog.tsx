import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LangDot } from '@/components/ui/lang-dot'
import { compactNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  Check,
  Loader2,
  Pin,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from '@/lib/icons'
import {
  useImportSelectedRepositories,
  useListGithubRepositories,
} from '@/features/github/actions'
import {
  buildRepositoryManagerItems,
  filterRepositoryManagerItems,
  getRepositoryViewQueryKeys,
  sortVisibleProjectPreviews,
  type GithubRepositoryManagerRecord,
  type RepositoryManagerItem,
  updateMineProjectsVisibility,
  updatePinnedProjectIds,
  updateVisibleProjectPreviews,
} from '@/features/github/repository-manager'
import {
  usePinOwnedProject,
  useUpdateProjectVisibility,
} from '@/features/projects/mutations'
import { mineProjectsQueryOptions } from '@/features/projects/queries'
import {
  publicProfileOverviewQueryOptions,
  publicProfileProjectsQueryOptions,
  privateProfileOverviewQueryOptions,
  privateProfileProjectsQueryOptions,
} from '@/features/profile/queries'
import type {
  PrivateProfileOverviewPayload,
  ProjectCardPreview,
  PublicProfileOverviewPayload,
} from '@/features/contracts'

const statusCopy: Record<RepositoryManagerItem['status'], string> = {
  on_profile: 'on profile',
  hidden: 'hidden',
  available: 'available',
}

export function RepositoryManagerDialog({
  buttonClassName,
  buttonLabel,
  buttonSize = 'meta',
  buttonVariant = 'monoOutline',
  description,
  emptyStateCopy = 'No imported or public GitHub repositories found yet.',
  helperCopy,
  pinnedProjectIds,
  profileUsername,
  title,
}: {
  buttonClassName?: string
  buttonLabel: string
  buttonSize?: 'meta' | 'compact'
  buttonVariant?: 'brand' | 'monoOutline' | 'monoGhost'
  description: string
  emptyStateCopy?: string
  helperCopy?: string
  pinnedProjectIds: Array<Id<'projects'>>
  profileUsername: string
  title: string
}) {
  const queryClient = useQueryClient()
  const mineProjectsQuery = useQuery(mineProjectsQueryOptions())
  const listGithubRepositories = useListGithubRepositories()
  const importSelectedRepositories = useImportSelectedRepositories()
  const updateProjectVisibility = useUpdateProjectVisibility()
  const pinOwnedProject = usePinOwnedProject()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [githubRepositories, setGithubRepositories] = useState<
    GithubRepositoryManagerRecord[]
  >([])
  const [githubError, setGithubError] = useState<string | null>(null)
  const [githubLoading, setGithubLoading] = useState(false)
  const [githubLoaded, setGithubLoaded] = useState(false)
  const [selectedRepoFullNames, setSelectedRepoFullNames] = useState<string[]>(
    [],
  )
  const [busyRepoFullNames, setBusyRepoFullNames] = useState<Set<string>>(
    new Set(),
  )
  const [submittingImport, setSubmittingImport] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const items = useMemo(
    () =>
      buildRepositoryManagerItems({
        githubRepositories,
        pinnedProjectIds,
        projects: mineProjectsQuery.data ?? [],
      }),
    [githubRepositories, mineProjectsQuery.data, pinnedProjectIds],
  )
  const filteredItems = useMemo(
    () => filterRepositoryManagerItems(items, query),
    [items, query],
  )

  useEffect(() => {
    if (!open || githubLoaded || githubLoading) {
      return
    }

    void loadGithubRepositories()
  }, [githubLoaded, githubLoading, open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedRepoFullNames([])
      setFeedback(null)
    }
  }, [open])

  const mineProjectsQueryKey = mineProjectsQueryOptions().queryKey
  const privateProfileOverviewQueryKey =
    privateProfileOverviewQueryOptions().queryKey
  const privateProfileProjectsQueryKey =
    privateProfileProjectsQueryOptions().queryKey
  const publicProfileOverviewQueryKey =
    publicProfileOverviewQueryOptions(profileUsername).queryKey
  const publicProfileProjectsQueryKey =
    publicProfileProjectsQueryOptions(profileUsername).queryKey

  const getMineProject = (projectId: Id<'projects'>) =>
    (
      queryClient.getQueryData<Array<Doc<'projects'>>>(mineProjectsQueryKey) ??
      []
    ).find((project) => project._id === projectId)

  const updateOverviewCaches = ({
    pinnedIds,
    projectsCount,
  }: {
    pinnedIds?: Array<Id<'projects'>>
    projectsCount?: number
  }) => {
    queryClient.setQueryData<PrivateProfileOverviewPayload | undefined>(
      privateProfileOverviewQueryKey,
      (current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          viewer: {
            ...current.viewer,
            pinnedProfileProjectIds:
              pinnedIds ?? current.viewer.pinnedProfileProjectIds,
            stats:
              typeof projectsCount === 'number'
                ? {
                    ...current.viewer.stats,
                    projectsCount,
                  }
                : current.viewer.stats,
          },
        }
      },
    )

    queryClient.setQueryData<PublicProfileOverviewPayload | null | undefined>(
      publicProfileOverviewQueryKey,
      (current) => {
        if (!current) {
          return current
        }

        return typeof projectsCount === 'number'
          ? {
              ...current,
              stats: {
                ...current.stats,
                projectsCount,
              },
            }
          : current
      },
    )
  }

  const invalidateRepositoryViews = async () => {
    await Promise.all(
      getRepositoryViewQueryKeys({
        mineProjectsQueryKey,
        privateProfileOverviewQueryKey,
        privateProfileProjectsQueryKey,
        publicProfileOverviewQueryKey,
        publicProfileProjectsQueryKey,
      }).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
  }

  const loadGithubRepositories = async () => {
    setGithubLoading(true)
    setGithubError(null)

    try {
      const repositories = (await listGithubRepositories(
        {},
      )) as GithubRepositoryManagerRecord[]
      setGithubRepositories(repositories)
      setGithubLoaded(true)
    } catch (error) {
      console.error(error)
      setGithubError(
        'Could not load your public GitHub repositories right now. Retry to reconnect and refresh the list.',
      )
    } finally {
      setGithubLoading(false)
    }
  }

  const setRepoBusy = (fullName: string, busy: boolean) => {
    setBusyRepoFullNames((current) => {
      const next = new Set(current)
      if (busy) {
        next.add(fullName)
      } else {
        next.delete(fullName)
      }
      return next
    })
  }

  const handleImportSelected = async () => {
    if (submittingImport || selectedRepoFullNames.length === 0) {
      return
    }

    setSubmittingImport(true)
    setFeedback(null)

    try {
      const result = await importSelectedRepositories({
        fullNames: selectedRepoFullNames,
      })

      const skippedRepos = result.skippedRepos ?? []
      const importedCount = (result.reposNew ?? 0) + (result.reposUpdated ?? 0)

      setFeedback(
        skippedRepos.length > 0
          ? `${importedCount} repositories updated. ${skippedRepos.length} could not be imported right now.`
          : `${importedCount} repositories are now synced with your profile.`,
      )
      setSelectedRepoFullNames([])
      await invalidateRepositoryViews()
    } catch (error) {
      console.error(error)
      setFeedback(
        'Import did not complete. Retry after checking your GitHub connection.',
      )
    } finally {
      setSubmittingImport(false)
    }
  }

  const handleToggleVisibility = async (
    item: RepositoryManagerItem,
    nextVisible: boolean,
  ) => {
    if (!item.projectId || busyRepoFullNames.has(item.fullName)) {
      return
    }

    setRepoBusy(item.fullName, true)
    setFeedback(null)

    const project = getMineProject(item.projectId)
    const previousMineProjects =
      queryClient.getQueryData<Array<Doc<'projects'>>>(mineProjectsQueryKey)
    const previousPrivateOverview =
      queryClient.getQueryData<PrivateProfileOverviewPayload>(
        privateProfileOverviewQueryKey,
      )
    const previousPrivateProjects = queryClient.getQueryData<
      Array<ProjectCardPreview>
    >(privateProfileProjectsQueryKey)
    const previousPublicOverview =
      queryClient.getQueryData<PublicProfileOverviewPayload | null>(
        publicProfileOverviewQueryKey,
      )
    const previousPublicProjects =
      queryClient.getQueryData<Array<ProjectCardPreview> | null>(
        publicProfileProjectsQueryKey,
      )
    const nextPinnedIds = nextVisible
      ? [...pinnedProjectIds]
      : pinnedProjectIds.filter((id) => id !== item.projectId)
    const currentProjectsCount =
      previousPrivateOverview?.viewer.stats.projectsCount ?? null
    const currentVisibility =
      project?.locatic.isVisible ?? item.status === 'on_profile'
    const nextProjectsCount =
      currentProjectsCount === null || currentVisibility === nextVisible
        ? currentProjectsCount
        : nextVisible
          ? currentProjectsCount + 1
          : Math.max(0, currentProjectsCount - 1)

    await Promise.all([
      queryClient.cancelQueries({ queryKey: mineProjectsQueryKey }),
      queryClient.cancelQueries({ queryKey: privateProfileOverviewQueryKey }),
      queryClient.cancelQueries({ queryKey: privateProfileProjectsQueryKey }),
      queryClient.cancelQueries({ queryKey: publicProfileOverviewQueryKey }),
      queryClient.cancelQueries({ queryKey: publicProfileProjectsQueryKey }),
    ])

    queryClient.setQueryData<Array<Doc<'projects'>> | undefined>(
      mineProjectsQueryKey,
      (current) =>
        updateMineProjectsVisibility(current, item.projectId!, nextVisible),
    )
    updateOverviewCaches({
      pinnedIds: nextPinnedIds,
      projectsCount:
        typeof nextProjectsCount === 'number' ? nextProjectsCount : undefined,
    })
    queryClient.setQueryData<Array<ProjectCardPreview> | undefined>(
      privateProfileProjectsQueryKey,
      (current) =>
        updateVisibleProjectPreviews({
          previews: current,
          project,
          projectId: item.projectId!,
          isVisible: nextVisible,
          pinnedProjectIds: nextPinnedIds,
          overview: previousPrivateOverview ?? null,
          audience: 'private',
          profileUsername,
        }),
    )
    queryClient.setQueryData<Array<ProjectCardPreview> | null | undefined>(
      publicProfileProjectsQueryKey,
      (current) =>
        updateVisibleProjectPreviews({
          previews: current ?? undefined,
          project,
          projectId: item.projectId!,
          isVisible: nextVisible,
          pinnedProjectIds: nextPinnedIds,
          overview: previousPublicOverview ?? null,
          audience: 'public',
          profileUsername,
        }) ?? current,
    )

    try {
      const result = await updateProjectVisibility({
        isVisible: nextVisible,
        projectId: item.projectId,
      })
      updateOverviewCaches({
        pinnedIds: result.pinnedProjectIds,
        projectsCount: result.projectsCount,
      })
      setFeedback(
        nextVisible
          ? `${item.fullName} is back on your profile.`
          : `${item.fullName} is hidden from your public profile.`,
      )
      await invalidateRepositoryViews()
    } catch (error) {
      console.error(error)
      queryClient.setQueryData(mineProjectsQueryKey, previousMineProjects)
      queryClient.setQueryData(
        privateProfileOverviewQueryKey,
        previousPrivateOverview,
      )
      queryClient.setQueryData(
        privateProfileProjectsQueryKey,
        previousPrivateProjects,
      )
      queryClient.setQueryData(
        publicProfileOverviewQueryKey,
        previousPublicOverview,
      )
      queryClient.setQueryData(
        publicProfileProjectsQueryKey,
        previousPublicProjects,
      )
      setFeedback(`Could not update ${item.fullName}. Please try again.`)
    } finally {
      setRepoBusy(item.fullName, false)
    }
  }

  const handleTogglePin = async (item: RepositoryManagerItem) => {
    if (!item.projectId || busyRepoFullNames.has(item.fullName)) {
      return
    }

    setRepoBusy(item.fullName, true)
    setFeedback(null)

    const nextPinnedIds = updatePinnedProjectIds(
      pinnedProjectIds,
      item.projectId,
      !item.isPinned,
    )
    const previousPrivateOverview =
      queryClient.getQueryData<PrivateProfileOverviewPayload>(
        privateProfileOverviewQueryKey,
      )
    const previousPrivateProjects = queryClient.getQueryData<
      Array<ProjectCardPreview>
    >(privateProfileProjectsQueryKey)
    const previousPublicProjects =
      queryClient.getQueryData<Array<ProjectCardPreview> | null>(
        publicProfileProjectsQueryKey,
      )

    await Promise.all([
      queryClient.cancelQueries({ queryKey: privateProfileOverviewQueryKey }),
      queryClient.cancelQueries({ queryKey: privateProfileProjectsQueryKey }),
      queryClient.cancelQueries({ queryKey: publicProfileProjectsQueryKey }),
    ])

    updateOverviewCaches({ pinnedIds: nextPinnedIds })
    queryClient.setQueryData<Array<ProjectCardPreview> | undefined>(
      privateProfileProjectsQueryKey,
      (current) => sortVisibleProjectPreviews(current, nextPinnedIds),
    )
    queryClient.setQueryData<Array<ProjectCardPreview> | null | undefined>(
      publicProfileProjectsQueryKey,
      (current) =>
        sortVisibleProjectPreviews(current ?? undefined, nextPinnedIds) ??
        current,
    )

    try {
      const result = await pinOwnedProject({
        pinned: !item.isPinned,
        projectId: item.projectId,
      })
      updateOverviewCaches({ pinnedIds: result })
      setFeedback(
        item.isPinned
          ? `${item.fullName} was unpinned.`
          : `${item.fullName} was pinned on your profile.`,
      )
      await invalidateRepositoryViews()
    } catch (error) {
      console.error(error)
      queryClient.setQueryData(
        privateProfileOverviewQueryKey,
        previousPrivateOverview,
      )
      queryClient.setQueryData(
        privateProfileProjectsQueryKey,
        previousPrivateProjects,
      )
      queryClient.setQueryData(
        publicProfileProjectsQueryKey,
        previousPublicProjects,
      )
      setFeedback(`Could not update the pin state for ${item.fullName}.`)
    } finally {
      setRepoBusy(item.fullName, false)
    }
  }

  const toggleSelection = (fullName: string) => {
    setSelectedRepoFullNames((current) =>
      current.includes(fullName)
        ? current.filter((repoFullName) => repoFullName !== fullName)
        : [...current, fullName],
    )
  }

  return (
    <>
      {helperCopy && (
        <p className="font-sans text-[13px] leading-6 text-text-muted">
          {helperCopy}
        </p>
      )}
      <Button
        variant={buttonVariant}
        size={buttonSize}
        onClick={() => setOpen(true)}
        className={buttonClassName}
      >
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl gap-0 overflow-hidden border-line bg-surface p-0">
          <DialogHeader className="border-b border-line px-5 py-4 text-left">
            <DialogTitle className="font-mono text-[15px] text-text">
              {title}
            </DialogTitle>
            <DialogDescription className="font-sans text-[13px] leading-6 text-text-muted">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="border-b border-line px-5 py-4">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="search repositories by name, owner, description, or language"
                className="border-line bg-canvas pl-9 font-mono text-sm text-text placeholder:text-text-faint"
                aria-label="Search repositories"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-text-faint">
              <span>{items.length} repositories</span>
              <span>{selectedRepoFullNames.length} selected to add</span>
              {githubLoading && (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  refreshing GitHub list…
                </span>
              )}
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
            {githubError && (
              <div className="mb-4 rounded-card border border-danger/40 bg-danger/4 px-4 py-3">
                <div className="font-sans text-[13px] leading-6 text-text-muted">
                  {githubError}
                </div>
                <Button
                  variant="monoOutline"
                  size="compact"
                  onClick={() => void loadGithubRepositories()}
                  disabled={githubLoading}
                  className="mt-3"
                >
                  <RefreshCw size={12} />
                  retry
                </Button>
              </div>
            )}

            {feedback && (
              <div className="mb-4 rounded-card border border-line bg-canvas px-4 py-3 font-sans text-[13px] leading-6 text-text-muted">
                {feedback}
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="rounded-card border border-dashed border-line bg-canvas px-5 py-8 text-center">
                <div className="font-mono text-[12px] text-text-faint">
                  {items.length === 0
                    ? emptyStateCopy
                    : 'No repositories match your search.'}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredItems.map((item) => {
                  const selected = selectedRepoFullNames.includes(item.fullName)
                  const busy = busyRepoFullNames.has(item.fullName)

                  return (
                    <div
                      key={item.fullName}
                      className="rounded-card border border-line bg-canvas px-4 py-4 shadow-card"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2.5">
                            <div className="font-mono text-[13px] font-semibold text-text wrap-anywhere">
                              {item.fullName}
                            </div>
                            <span
                              className={cn(
                                'rounded-pill border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.04em]',
                                item.status === 'on_profile' &&
                                  'border-brand/30 bg-brand-quiet text-brand',
                                item.status === 'hidden' &&
                                  'border-line bg-surface text-text-faint',
                                item.status === 'available' &&
                                  'border-line bg-surface-alt text-text-faint',
                              )}
                            >
                              {statusCopy[item.status]}
                            </span>
                            {item.isPinned && (
                              <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-text-faint">
                                <Pin size={11} />
                                pinned
                              </span>
                            )}
                            {item.isMissingFromGithub && (
                              <span className="font-mono text-[10.5px] text-text-faint">
                                not currently visible from GitHub
                              </span>
                            )}
                          </div>

                          <p className="m-0 font-sans text-[13px] leading-6 text-text-muted">
                            {item.description || 'No description provided.'}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-text-faint">
                            {item.primaryLanguage && (
                              <span className="inline-flex items-center gap-1.5">
                                <LangDot lang={item.primaryLanguage} />
                                {item.primaryLanguage}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                              <Star size={11} />
                              {compactNumber(item.stargazersCount)}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {item.status === 'available' && (
                            <Button
                              variant={selected ? 'brand' : 'monoOutline'}
                              size="compact"
                              onClick={() => toggleSelection(item.fullName)}
                              aria-pressed={selected}
                            >
                              {selected ? <Check size={12} /> : <PlusIcon />}
                              {selected ? 'selected' : 'add'}
                            </Button>
                          )}

                          {item.status === 'on_profile' && (
                            <>
                              <Button
                                variant={
                                  item.isPinned ? 'brand' : 'monoOutline'
                                }
                                size="compact"
                                onClick={() => void handleTogglePin(item)}
                                disabled={busy}
                              >
                                <Pin size={12} />
                                {item.isPinned ? 'unpinned' : 'pin'}
                              </Button>
                              <Button
                                variant="monoGhost"
                                size="compact"
                                onClick={() =>
                                  void handleToggleVisibility(item, false)
                                }
                                disabled={busy}
                              >
                                <Trash2 size={12} />
                                remove
                              </Button>
                            </>
                          )}

                          {item.status === 'hidden' && (
                            <Button
                              variant="brand"
                              size="compact"
                              onClick={() =>
                                void handleToggleVisibility(item, true)
                              }
                              disabled={busy}
                            >
                              <RefreshCw size={12} />
                              restore
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="border-t border-line bg-surface px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-sans text-[13px] leading-6 text-text-muted">
                Select one or more available repos to add them without leaving
                this screen.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedRepoFullNames.length > 0 && (
                  <Button
                    variant="brand"
                    size="meta"
                    onClick={() => void handleImportSelected()}
                    disabled={submittingImport}
                  >
                    {submittingImport ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Check size={13} />
                    )}
                    {submittingImport
                      ? 'adding…'
                      : `add ${selectedRepoFullNames.length} selected`}
                  </Button>
                )}
                <Button
                  variant="monoGhost"
                  size="meta"
                  onClick={() => setOpen(false)}
                >
                  <X size={13} />
                  close
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PlusIcon() {
  return <span className="text-[14px] leading-none">+</span>
}
