import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { Id } from '../../../../convex/_generated/dataModel'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getActionErrorMessage } from '@/lib/action-error'
import { useUnsavedChangesGuard } from '@/features/settings/use-unsaved-changes-guard'
import {
  campaignPeriodLabel,
  campaignStatusLabel,
  type EmailCampaignContent,
  type EmailCampaignDetail,
  type EmailCampaignSummary,
  type EmailProjectSelection,
} from '../contracts'
import {
  useCancelEmailCampaignDelivery,
  useCreateEmailCampaign,
  usePrepareEmailCampaignReview,
  useRecoverEmailCampaignDelivery,
  useRetryFailedEmailContacts,
  useRequestEmailCampaignSend,
  useSaveEmailCampaign,
  useSendEmailCampaignTest,
} from '../mutations'
import {
  emailCampaignListQueryOptions,
  emailCampaignProjectSearchQueryOptions,
  emailCampaignQueryOptions,
} from '../queries'

type DraftState = {
  campaignId: Id<'email_campaigns'>
  revision: number
  title: string
  content: EmailCampaignContent
}

const labelClassName = 'mb-1.5 block font-mono text-label text-text-muted'
const sectionTitleClassName =
  'font-mono text-meta font-semibold uppercase tracking-[0.06em] text-text-muted'

function detailToDraft(detail: EmailCampaignDetail): DraftState {
  return {
    campaignId: detail.id,
    revision: detail.revision,
    title: detail.title,
    content: detail.content,
  }
}

function sameDraft(left: DraftState | null, right: DraftState | null) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function moveItem<T>(items: T[], from: number, to: number) {
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  if (item === undefined) return items
  copy.splice(to, 0, item)
  return copy
}

function SelectedContentRows<T>({
  items,
  kind,
  getKey,
  getPrimary,
  getSecondary,
  onChange,
}: {
  items: T[]
  kind: 'project' | 'discussion'
  getKey: (item: T) => string
  getPrimary: (item: T) => string
  getSecondary: (item: T) => string
  onChange: (items: T[]) => void
}) {
  if (items.length === 0) {
    return (
      <p className="font-mono text-label text-text-faint">
        no {kind}s selected
      </p>
    )
  }

  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li
          key={getKey(item)}
          className="flex items-center gap-3 rounded-control border border-line bg-canvas px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-label text-text">
              {getPrimary(item)}
            </p>
            <p className="truncate text-meta text-text-faint">
              {getSecondary(item)}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`move ${kind} up`}
              disabled={index === 0}
              onClick={() => onChange(moveItem(items, index, index - 1))}
            >
              ↑
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`move ${kind} down`}
              disabled={index === items.length - 1}
              onClick={() => onChange(moveItem(items, index, index + 1))}
            >
              ↓
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`remove ${kind}`}
              onClick={() =>
                onChange(items.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              remove
            </Button>
          </div>
        </li>
      ))}
    </ol>
  )
}

function AudienceReview({ detail }: { detail: EmailCampaignDetail }) {
  const run = detail.latestRun
  if (!run || run.revision !== detail.revision) {
    return (
      <p className="font-mono text-label text-text-faint">
        prepare a review to freeze this revision and calculate its audience.
      </p>
    )
  }
  const audience = run.audienceSummary
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        ['eligible', audience.eligible],
        ['disabled', audience.excludedDisabled],
        ['unverified', audience.excludedUnverified],
        ['suppressed', audience.excludedSuppressed],
        ['inactive', audience.excludedInactive],
        ['duplicates', audience.excludedDuplicate],
        ['sync pending', audience.pendingSync],
      ].map(([label, value]) => (
        <div key={label} className="border-l border-line pl-3">
          <p className="font-mono text-meta text-text-faint">{label}</p>
          <p className="font-mono text-body font-semibold text-text">{value}</p>
        </div>
      ))}
    </div>
  )
}

export function CampaignWorkspace() {
  const listQuery = useSuspenseQuery(emailCampaignListQueryOptions())
  const campaigns = listQuery.data as EmailCampaignSummary[]
  const [selectedId, setSelectedId] = useState<Id<'email_campaigns'> | null>(
    campaigns[0]?.id ?? null,
  )
  const detailQuery = useQuery(emailCampaignQueryOptions(selectedId))
  const detail = (detailQuery.data ?? null) as EmailCampaignDetail | null

  const createCampaign = useCreateEmailCampaign()
  const saveCampaign = useSaveEmailCampaign()
  const prepareReview = usePrepareEmailCampaignReview()
  const sendTest = useSendEmailCampaignTest()
  const requestSend = useRequestEmailCampaignSend()
  const recoverDelivery = useRecoverEmailCampaignDelivery()
  const cancelDelivery = useCancelEmailCampaignDelivery()
  const retryFailedContacts = useRetryFailedEmailContacts()

  const [draft, setDraft] = useState<DraftState | null>(null)
  const [savedDraft, setSavedDraft] = useState<DraftState | null>(null)
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testRecipient, setTestRecipient] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const projectResultsQuery = useQuery(
    emailCampaignProjectSearchQueryOptions(projectSearch),
  )
  const projectResults = (projectResultsQuery.data ??
    []) as EmailProjectSelection[]
  const isDirty = !sameDraft(draft, savedDraft)
  useUnsavedChangesGuard(isDirty)

  useEffect(() => {
    if (!detail) return
    const incoming = detailToDraft(detail)
    if (draft?.campaignId !== detail.id) {
      setDraft(incoming)
      setSavedDraft(incoming)
      setStale(false)
      return
    }
    if (detail.revision > draft.revision) {
      if (isDirty) {
        setStale(true)
      } else {
        setDraft(incoming)
        setSavedDraft(incoming)
        setStale(false)
      }
    }
  }, [detail, draft?.campaignId, draft?.revision, isDirty])

  const reviewedRun =
    detail && detail.latestRun?.revision === draft?.revision
      ? detail.latestRun
      : null
  const activeProjectIds = useMemo(
    () =>
      new Set(
        draft?.content.projects.map((project) => String(project.projectId)),
      ),
    [draft?.content.projects],
  )

  const run = async (label: string, operation: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      await operation()
    } catch (operationError) {
      setError(getActionErrorMessage(operationError))
    } finally {
      setBusy(null)
    }
  }

  const selectCampaign = (campaignId: Id<'email_campaigns'>) => {
    if (
      isDirty &&
      !window.confirm('You have unsaved changes. Switch campaigns anyway?')
    ) {
      return
    }
    setSelectedId(campaignId)
    setDraft(null)
    setSavedDraft(null)
    setError(null)
    setNotice(null)
  }

  const create = (kind: 'announcement' | 'digest') => {
    if (
      isDirty &&
      !window.confirm('You have unsaved changes. Create a new campaign anyway?')
    ) {
      return
    }
    void run('create', async () => {
      const id = await createCampaign({
        kind,
        title: kind === 'announcement' ? 'New announcement' : 'New digest',
      })
      setSelectedId(id)
      setNotice('Draft created.')
    })
  }

  const updateContent = <TKey extends keyof EmailCampaignContent>(
    key: TKey,
    value: EmailCampaignContent[TKey],
  ) => {
    setDraft((current) =>
      current
        ? { ...current, content: { ...current.content, [key]: value } }
        : current,
    )
  }

  const save = () => {
    if (!draft) return
    const submitted = draft
    void run('save', async () => {
      const revision = await saveCampaign({
        campaignId: submitted.campaignId,
        expectedRevision: submitted.revision,
        title: submitted.title,
        content: submitted.content,
      })
      const saved = { ...submitted, revision }
      setDraft((current) =>
        current?.campaignId === submitted.campaignId
          ? { ...current, revision }
          : current,
      )
      setSavedDraft((current) =>
        !current || current.campaignId === submitted.campaignId
          ? saved
          : current,
      )
      setStale(false)
      setNotice(`Revision ${revision} saved.`)
    })
  }

  const review = () => {
    if (!draft) return
    void run('review', async () => {
      await prepareReview({
        campaignId: draft.campaignId,
        expectedRevision: draft.revision,
      })
      setNotice(`Revision ${draft.revision} is ready for review.`)
    })
  }

  const test = () => {
    if (!reviewedRun) return
    void run('test', async () => {
      await sendTest({ reviewId: reviewedRun.id, recipient: testRecipient })
      setNotice(`Test sent to ${testRecipient}.`)
    })
  }

  const send = () => {
    if (!draft || !reviewedRun) return
    void run('send', async () => {
      await requestSend({
        campaignId: draft.campaignId,
        reviewedRevision: draft.revision,
        reviewId: reviewedRun.id,
      })
      setNotice('Send request queued. Delivery status will update here.')
    })
  }

  const recover = () => {
    if (!reviewedRun) return
    void run('recover', async () => {
      const result = await recoverDelivery({ runId: reviewedRun.id })
      setNotice(
        result === 'accepted'
          ? 'Provider already accepted this delivery.'
          : 'Delivery recovery queued.',
      )
    })
  }

  const cancel = () => {
    if (!reviewedRun) return
    if (
      !window.confirm(
        'Cancel this undispatched delivery request? This cannot recall email after provider handoff.',
      )
    ) {
      return
    }
    void run('cancel', async () => {
      await cancelDelivery({ runId: reviewedRun.id })
      setNotice('Undispatched delivery request cancelled.')
    })
  }

  const retryContacts = () => {
    void run('retry-contacts', async () => {
      const result = await retryFailedContacts({ limit: 25 })
      setNotice(`Requeued ${result.retried} failed contacts.`)
    })
  }

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6"
    >
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-meta uppercase tracking-[0.08em] text-brand">
            internal
          </p>
          <h1 className="font-sans text-title font-semibold text-text">
            community email
          </h1>
          <p className="mt-1 max-w-2xl text-body text-text-muted">
            Prepare one structured edition, review the exact artifact, then make
            a separate send decision.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => create('digest')}
            disabled={busy !== null}
          >
            new digest
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => create('announcement')}
            disabled={busy !== null}
          >
            new announcement
          </Button>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-control border border-danger px-3 py-2 text-body text-danger"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-control border border-line px-3 py-2 text-body text-text-muted"
        >
          {notice}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card as="aside" density="flush" aria-label="campaigns">
          <div className="border-b border-line px-4 py-3">
            <h2 className={sectionTitleClassName}>campaigns</h2>
            <p className="mt-1 font-mono text-meta text-text-faint">
              latest 50
            </p>
          </div>
          {campaigns.length === 0 ? (
            <p className="px-4 py-6 font-mono text-label text-text-faint">
              no campaigns yet
            </p>
          ) : (
            <ul>
              {campaigns.map((campaign) => (
                <li
                  key={campaign.id}
                  className="border-b border-line last:border-b-0"
                >
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left hover:bg-state-hover"
                    aria-pressed={campaign.id === selectedId}
                    onClick={() => selectCampaign(campaign.id)}
                  >
                    <span className="block truncate font-mono text-label text-text">
                      {campaign.title}
                    </span>
                    <span className="mt-1 block text-meta text-text-faint">
                      {campaign.kind} · {campaignStatusLabel(campaign.state)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {!draft || !detail ? (
          <Card className="flex min-h-64 items-center justify-center">
            <p className="font-mono text-label text-text-faint">
              {selectedId && detailQuery.isLoading
                ? 'loading campaign...'
                : 'select or create a campaign'}
            </p>
          </Card>
        ) : (
          <div className="min-w-0 space-y-5">
            {stale ? (
              <Card className="border-danger" role="alert">
                <p className="text-body text-text">
                  A newer revision is available. Reload before saving this
                  draft.
                </p>
              </Card>
            ) : null}

            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
              <Card
                as="section"
                density="cozy"
                aria-labelledby="campaign-editor-title"
              >
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2
                      id="campaign-editor-title"
                      className={sectionTitleClassName}
                    >
                      edition
                    </h2>
                    <p className="mt-1 font-mono text-meta text-text-faint">
                      revision {draft.revision} · {campaignPeriodLabel(detail)}{' '}
                      · {campaignStatusLabel(detail.state)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={save}
                    disabled={!isDirty || stale || busy !== null}
                  >
                    {busy === 'save' ? 'saving...' : 'save draft'}
                  </Button>
                </div>

                <div className="space-y-4">
                  <label>
                    <span className={labelClassName}>internal title</span>
                    <Input
                      value={draft.title}
                      onChange={(event) =>
                        setDraft({ ...draft, title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className={labelClassName}>subject</span>
                    <Input
                      value={draft.content.subject}
                      maxLength={140}
                      onChange={(event) =>
                        updateContent('subject', event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span className={labelClassName}>preheader</span>
                    <Input
                      value={draft.content.preheader}
                      maxLength={200}
                      onChange={(event) =>
                        updateContent('preheader', event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span className={labelClassName}>introduction</span>
                    <Textarea
                      className="min-h-28"
                      value={draft.content.introduction}
                      onChange={(event) =>
                        updateContent('introduction', event.target.value)
                      }
                    />
                  </label>

                  <section
                    aria-labelledby="selected-projects-title"
                    className="space-y-3 border-t border-line pt-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3
                        id="selected-projects-title"
                        className={sectionTitleClassName}
                      >
                        selected projects
                      </h3>
                      <span className="font-mono text-meta text-text-faint">
                        {draft.content.projects.length}/5
                      </span>
                    </div>
                    <SelectedContentRows
                      items={draft.content.projects}
                      kind="project"
                      getKey={(project) => String(project.projectId)}
                      getPrimary={(project) => project.fullName}
                      getSecondary={(project) => project.activityLabel}
                      onChange={(items) => updateContent('projects', items)}
                    />
                    <label>
                      <span className={labelClassName}>
                        find a public project
                      </span>
                      <Input
                        value={projectSearch}
                        placeholder="owner/repository"
                        onChange={(event) =>
                          setProjectSearch(event.target.value)
                        }
                      />
                      <span className="mt-1 block text-meta text-text-faint">
                        Searches the 75 most recently eligible projects.
                      </span>
                    </label>
                    {projectSearch.trim() ? (
                      <ul
                        className="space-y-1"
                        aria-label="project search results"
                      >
                        {projectResults.map((project) => {
                          const selected = activeProjectIds.has(
                            String(project.projectId),
                          )
                          return (
                            <li
                              key={project.projectId}
                              className="flex items-center justify-between gap-3 border-b border-line py-2"
                            >
                              <span className="truncate font-mono text-label text-text-muted">
                                {project.fullName}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  selected || draft.content.projects.length >= 5
                                }
                                onClick={() =>
                                  updateContent('projects', [
                                    ...draft.content.projects,
                                    project,
                                  ])
                                }
                              >
                                {selected ? 'selected' : 'add'}
                              </Button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}
                  </section>

                  <section
                    aria-labelledby="selected-discussions-title"
                    className="space-y-3 border-t border-line pt-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3
                        id="selected-discussions-title"
                        className={sectionTitleClassName}
                      >
                        selected discussions
                      </h3>
                      <span className="font-mono text-meta text-text-faint">
                        {draft.content.discussions.length}/2
                      </span>
                    </div>
                    <SelectedContentRows
                      items={draft.content.discussions}
                      kind="discussion"
                      getKey={(discussion) => String(discussion.commentId)}
                      getPrimary={(discussion) => discussion.title}
                      getSecondary={(discussion) => discussion.summary}
                      onChange={(items) => updateContent('discussions', items)}
                    />
                  </section>

                  <label className="block border-t border-line pt-4">
                    <span className={labelClassName}>
                      Locatic shipping update
                    </span>
                    <Textarea
                      className="min-h-28"
                      value={draft.content.shippingUpdate}
                      onChange={(event) =>
                        updateContent('shippingUpdate', event.target.value)
                      }
                    />
                  </label>
                </div>
              </Card>

              <Card
                as="section"
                density="cozy"
                className="min-w-0"
                aria-labelledby="preview-title"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 id="preview-title" className={sectionTitleClassName}>
                    reviewed preview
                  </h2>
                  <Button
                    type="button"
                    onClick={review}
                    disabled={isDirty || stale || busy !== null}
                  >
                    {busy === 'review' ? 'preparing...' : 'prepare review'}
                  </Button>
                </div>
                {reviewedRun ? (
                  <iframe
                    title="reviewed campaign preview"
                    sandbox=""
                    srcDoc={reviewedRun.html}
                    className="h-[640px] w-full rounded-control border border-line bg-white"
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-control border border-dashed border-line px-6 text-center">
                    <p className="font-mono text-label text-text-faint">
                      save and prepare a review to render the exact immutable
                      email artifact.
                    </p>
                  </div>
                )}
              </Card>
            </div>

            <Card
              as="section"
              density="cozy"
              aria-labelledby="send-review-title"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="send-review-title" className={sectionTitleClassName}>
                    audience and delivery
                  </h2>
                  <p className="mt-1 text-body text-text-muted">
                    Provider acceptance is not proof of inbox delivery. Pending
                    contact sync blocks sending.
                  </p>
                  <p className="mt-2 font-mono text-meta text-text-faint">
                    from {detail.sender ?? 'not configured'} · reply-to{' '}
                    {detail.replyTo ?? 'not configured'}
                  </p>
                </div>
                {reviewedRun ? (
                  <span className="font-mono text-label text-text-muted">
                    {campaignStatusLabel(reviewedRun.stage)}
                  </span>
                ) : null}
              </div>
              <AudienceReview detail={detail} />
              {reviewedRun?.metrics ? (
                <p className="mt-4 font-mono text-meta text-text-faint">
                  sent {reviewedRun.metrics.sent} · delivered{' '}
                  {reviewedRun.metrics.delivered} · bounced{' '}
                  {reviewedRun.metrics.bounced} · complained{' '}
                  {reviewedRun.metrics.complained} · failed{' '}
                  {reviewedRun.metrics.failed} · suppressed{' '}
                  {reviewedRun.metrics.suppressed}
                </p>
              ) : null}
              {reviewedRun?.lastError ? (
                <p className="mt-4 rounded-control border border-danger px-3 py-2 text-body text-danger">
                  {reviewedRun.lastError}
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4">
                <label className="min-w-64 flex-1">
                  <span className={labelClassName}>
                    allowlisted test recipient
                  </span>
                  <Input
                    type="email"
                    value={testRecipient}
                    onChange={(event) => setTestRecipient(event.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  onClick={test}
                  disabled={
                    !reviewedRun ||
                    !testRecipient ||
                    isDirty ||
                    stale ||
                    busy !== null
                  }
                >
                  {busy === 'test' ? 'sending test...' : 'send test'}
                </Button>
                {reviewedRun &&
                (reviewedRun.stage === 'needs_attention' ||
                  reviewedRun.stage === 'failed') ? (
                  <Button
                    type="button"
                    onClick={recover}
                    disabled={busy !== null}
                  >
                    {busy === 'recover' ? 'recovering...' : 'recover delivery'}
                  </Button>
                ) : null}
                {reviewedRun && reviewedRun.audienceSummary.pendingSync > 0 ? (
                  <Button
                    type="button"
                    onClick={retryContacts}
                    disabled={busy !== null}
                  >
                    {busy === 'retry-contacts'
                      ? 'retrying...'
                      : 'retry failed contacts'}
                  </Button>
                ) : null}
                {reviewedRun?.canCancel ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancel}
                    disabled={busy !== null}
                  >
                    {busy === 'cancel'
                      ? 'cancelling...'
                      : 'cancel delivery request'}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="primary"
                  onClick={send}
                  disabled={
                    !reviewedRun ||
                    reviewedRun.stage !== 'ready' ||
                    reviewedRun.audienceSummary.eligible === 0 ||
                    reviewedRun.audienceSummary.pendingSync > 0 ||
                    isDirty ||
                    stale ||
                    busy !== null
                  }
                >
                  {busy === 'send'
                    ? 'requesting...'
                    : `send to ${reviewedRun?.audienceSummary.eligible ?? 0} subscribers`}
                </Button>
              </div>
              <p className="mt-3 text-meta text-text-faint">
                Cancellation is available only before provider handoff and is
                never presented as recall.
              </p>
            </Card>
          </div>
        )}
      </div>
    </main>
  )
}
