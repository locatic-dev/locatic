import { captureSessionCache } from '@/integrations/convex/session-cache'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  useImportSelectedRepositories,
  useListGithubRepositories,
} from '@/features/github/actions'
import {
  buildRepositoryManagerItems,
  canPinRepositoryManagerItem,
  filterRepositoryManagerItems,
  getRepositoryViewQueryKeys,
  getRepositoryImportFeedback,
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
  privateProfileOverviewQueryOptions,
  privateProfileProjectsQueryOptions,
  publicProfileOverviewQueryOptions,
  publicProfileProjectsQueryOptions,
} from '@/features/profile/queries'
import { reportActionError } from '@/lib/action-error'
import { showUndoToast } from '@/lib/undo-toast'
import type {
  PrivateProfileOverviewPayload,
  ProjectCardPreview,
  PublicProfileOverviewPayload,
} from '@/features/contracts'

export function useRepositoryManagerController({
  pinnedProjectIds,
  profileUsername,
}: {
  pinnedProjectIds: Array<Id<'projects'>>
  profileUsername: string
}) {
  const queryClient = useQueryClient()
  const isCurrentSession = captureSessionCache(queryClient)
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

  const mineProjectsQueryKey = mineProjectsQueryOptions().queryKey
  const privateProfileOverviewQueryKey =
    privateProfileOverviewQueryOptions().queryKey
  const privateProfileProjectsQueryKey =
    privateProfileProjectsQueryOptions().queryKey
  const publicProfileOverviewQueryKey =
    publicProfileOverviewQueryOptions(profileUsername).queryKey
  const publicProfileProjectsQueryKey =
    publicProfileProjectsQueryOptions(profileUsername).queryKey

  const items = useMemo(
    () =>
      buildRepositoryManagerItems({
        githubRepositories,
        pinnedProjectIds,
        projects: (mineProjectsQuery.data ?? []) as Doc<'projects'>[],
      }),
    [githubRepositories, mineProjectsQuery.data, pinnedProjectIds],
  )
  const filteredItems = useMemo(
    () => filterRepositoryManagerItems(items, query),
    [items, query],
  )

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
    if (!isCurrentSession()) return
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
    if (!isCurrentSession()) return
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
        getRepositoryImportFeedback(importedCount, skippedRepos.length),
      )
      setSelectedRepoFullNames([])
      await invalidateRepositoryViews()
    } catch (error) {
      console.error(error)
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Import did not complete. Retry after checking your GitHub connection.',
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

    if (!isCurrentSession()) return
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
      if (!isCurrentSession()) return
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

  // Shared by the pin toggle and its undo: applies the change optimistically,
  // restores the caches and rethrows on failure so each caller reports it.
  const setProjectPinned = async (
    item: RepositoryManagerItem & { projectId: Id<'projects'> },
    nextPinned: boolean,
  ) => {
    setRepoBusy(item.fullName, true)
    setFeedback(null)

    const nextPinnedIds = updatePinnedProjectIds(
      pinnedProjectIds,
      item.projectId,
      nextPinned,
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

    if (!isCurrentSession()) return
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
        pinned: nextPinned,
        projectId: item.projectId,
      })
      updateOverviewCaches({ pinnedIds: result })
      await invalidateRepositoryViews()
    } catch (error) {
      if (!isCurrentSession()) return
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
      throw error
    } finally {
      setRepoBusy(item.fullName, false)
    }
  }

  const handleTogglePin = async (item: RepositoryManagerItem) => {
    const { projectId } = item
    if (
      !projectId ||
      !canPinRepositoryManagerItem(item) ||
      busyRepoFullNames.has(item.fullName)
    ) {
      return
    }

    const pinnedItem = { ...item, projectId }
    const unpinning = item.isPinned
    try {
      await setProjectPinned(pinnedItem, !unpinning)
    } catch (error) {
      if (!isCurrentSession()) return
      reportActionError(error, {
        title: unpinning ? "couldn't unpin" : "couldn't pin",
        retry: () => handleTogglePin(item),
      })
      return
    }

    if (!isCurrentSession()) return
    if (unpinning) {
      showUndoToast({
        message: `unpinned ${item.fullName}`,
        undo: () => setProjectPinned(pinnedItem, true),
      })
    } else {
      setFeedback(`${item.fullName} was pinned on your profile.`)
    }
  }

  const toggleSelection = (fullName: string) => {
    setSelectedRepoFullNames((current) =>
      current.includes(fullName)
        ? current.filter((repoFullName) => repoFullName !== fullName)
        : [...current, fullName],
    )
  }

  return {
    busyRepoFullNames,
    feedback,
    filteredItems,
    githubError,
    githubLoading,
    handleImportSelected,
    handleTogglePin,
    handleToggleVisibility,
    items,
    loadGithubRepositories,
    open,
    query,
    selectedRepoFullNames,
    setOpen,
    setQuery,
    submittingImport,
    toggleSelection,
  }
}
