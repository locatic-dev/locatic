import type { Id } from '../../../convex/_generated/dataModel'
import { Button, type ButtonProps } from '@/components/ui/button'
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
import type { RepositoryManagerItem } from '@/features/github/repository-manager'
import { useRepositoryManagerController } from '@/features/github/use-repository-manager-controller'

const statusCopy: Record<RepositoryManagerItem['status'], string> = {
  on_profile: 'on profile',
  hidden: 'hidden',
  available: 'available',
}

export function RepositoryManagerDialog({
  buttonClassName,
  buttonLabel,
  buttonSize = 'meta',
  buttonVariant = 'secondary',
  description,
  emptyStateCopy = 'No imported or public GitHub repositories found yet.',
  helperCopy,
  pinnedProjectIds,
  profileUsername,
  title,
}: {
  buttonClassName?: string
  buttonLabel: string
  buttonSize?: ButtonProps['size']
  buttonVariant?: ButtonProps['variant']
  description: string
  emptyStateCopy?: string
  helperCopy?: string
  pinnedProjectIds: Array<Id<'projects'>>
  profileUsername: string
  title: string
}) {
  const controller = useRepositoryManagerController({
    pinnedProjectIds,
    profileUsername,
  })
  const {
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
  } = controller

  return (
    <>
      {helperCopy && (
        <p className="font-sans text-body leading-6 text-text-muted">
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-line py-4 pl-5 pr-14">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
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
                className="pl-9"
                aria-label="Search repositories"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-meta text-text-faint">
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

          <div className="min-h-0 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
            {githubError && (
              <div className="mb-4 flex flex-col items-start gap-3 rounded-card border border-danger/40 bg-danger/4 px-4 py-3">
                <div className="font-sans text-body leading-6 text-text-muted">
                  {githubError}
                </div>
                <Button
                  size="sm"
                  onClick={() => void loadGithubRepositories()}
                  disabled={githubLoading}
                >
                  <RefreshCw size={12} />
                  retry
                </Button>
              </div>
            )}

            {feedback && (
              <div className="mb-4 rounded-card border border-line bg-canvas px-4 py-3 font-sans text-body leading-6 text-text-muted">
                {feedback}
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="rounded-card border border-dashed border-line bg-canvas px-5 py-8 text-center">
                <div className="font-mono text-label text-text-faint">
                  {items.length === 0
                    ? emptyStateCopy
                    : 'No repositories match your search.'}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredItems.map((item) => {
                  const selected = selectedRepoFullNames.includes(item.fullName)
                  const busy = busyRepoFullNames.has(item.fullName)

                  return (
                    <div
                      key={item.fullName}
                      className="rounded-card border border-line bg-canvas px-3 py-3 transition-colors hover:border-line-strong sm:px-4"
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex flex-wrap items-center gap-2">
                            <div className="font-mono text-[13px] font-semibold text-text wrap-anywhere">
                              {item.fullName}
                            </div>
                            <span
                              className={cn(
                                'rounded-pill border px-2 py-1 font-mono text-meta uppercase tracking-[0.04em]',
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
                              <span className="inline-flex items-center gap-1 font-mono text-meta text-text-faint">
                                <Pin size={11} />
                                pinned
                              </span>
                            )}
                            {item.isMissingFromGithub && (
                              <span className="font-mono text-meta text-text-faint">
                                not currently visible from GitHub
                              </span>
                            )}
                          </div>

                          <p className="m-0 line-clamp-2 font-sans text-[12.5px] leading-5 text-text-muted">
                            {item.description || 'No description provided.'}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-meta text-text-faint">
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

                        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                          {item.status === 'available' && (
                            <Button
                              variant={selected ? 'primary' : 'secondary'}
                              size="sm"
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
                                  item.isPinned ? 'primary' : 'secondary'
                                }
                                size="sm"
                                onClick={() => void handleTogglePin(item)}
                                disabled={busy}
                                aria-label={
                                  item.isPinned
                                    ? `Unpin ${item.fullName} from profile`
                                    : `Pin ${item.fullName} to profile`
                                }
                                aria-pressed={item.isPinned}
                              >
                                <Pin size={12} />
                                {item.isPinned ? 'unpin' : 'pin'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
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
                              variant="primary"
                              size="sm"
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
              <div className="font-sans text-body leading-6 text-text-muted">
                Select one or more available repos to add them without leaving
                this screen.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedRepoFullNames.length > 0 && (
                  <Button
                    variant="primary"
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
                  variant="ghost"
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
