import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Id } from '../../../../convex/_generated/dataModel'

import { PageHeader } from '@/components/app-shell/page-header'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getActionErrorMessage, reportActionError } from '@/lib/action-error'
import { useUnsavedChangesGuard } from '@/features/settings/use-unsaved-changes-guard'
import {
  type CampaignDraft,
  detailToDraft,
  type EmailCampaignDetail,
  type EmailCampaignKind,
  type EmailCampaignSummary,
  isStaleDraftError,
  sameDraft,
} from '../contracts'
import {
  useCancelEmailSend,
  useCreateEmailCampaign,
  useRequestEmailSend,
  useResumeEmailSend,
  useSaveEmailCampaign,
} from '../mutations'
import {
  emailCampaignListQueryOptions,
  emailCampaignQueryOptions,
} from '../queries'
import { useCampaignPreview } from '../use-campaign-preview'
import { CampaignEditor } from './campaign-editor'
import { CampaignList } from './campaign-list'
import { CampaignResults } from './campaign-results'
import { PreviewPane } from './preview-pane'
import { SendDialog } from './send-dialog'
import { TestSendPanel } from './test-send-panel'

/** Write, Test and Send for one draft; owns the unsaved edits. */
function DraftPanel({
  detail,
  onDirtyChange,
}: {
  detail: EmailCampaignDetail
  onDirtyChange: (dirty: boolean) => void
}) {
  const saveCampaign = useSaveEmailCampaign()
  const requestSend = useRequestEmailSend()
  const [saved, setSaved] = useState(() => ({
    revision: detail.revision,
    draft: detailToDraft(detail),
  }))
  const [draft, setDraft] = useState<CampaignDraft>(saved.draft)
  const [saving, setSaving] = useState(false)
  const [stale, setStale] = useState(false)
  const isDirty = !sameDraft(draft, saved.draft)
  const preview = useCampaignPreview({
    subject: draft.subject,
    preheader: draft.preheader,
    content: draft.content,
  })

  useUnsavedChangesGuard(isDirty)
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  // Someone else saved: follow along when clean, warn when there are edits.
  useEffect(() => {
    if (detail.revision <= saved.revision) return
    if (isDirty) {
      setStale(true)
      return
    }
    const next = detailToDraft(detail)
    setSaved({ revision: detail.revision, draft: next })
    setDraft(next)
  }, [detail, isDirty, saved.revision])

  const reload = () => {
    const next = detailToDraft(detail)
    setSaved({ revision: detail.revision, draft: next })
    setDraft(next)
    setStale(false)
  }

  const save = async () => {
    const submitted = draft
    setSaving(true)
    try {
      const revision = await saveCampaign({
        campaignId: detail.id,
        expectedRevision: saved.revision,
        ...submitted,
      })
      setSaved({ revision, draft: submitted })
      setStale(false)
      toast.success('Draft saved.')
    } catch (error) {
      if (isStaleDraftError(getActionErrorMessage(error))) {
        setStale(true)
      } else {
        reportActionError(error, { title: "couldn't save the draft" })
      }
    } finally {
      setSaving(false)
    }
  }

  const blockedReason = !detail.sendingEnabled
    ? 'Sending is off in this environment.'
    : isDirty
      ? 'Save your changes before sending.'
      : null

  return (
    <Tabs defaultValue="write" className="space-y-5">
      <TabsList aria-label="Draft steps" className="border-b border-line">
        <TabsTrigger value="write">Write</TabsTrigger>
        <TabsTrigger value="test">Test</TabsTrigger>
        <TabsTrigger value="send">Send</TabsTrigger>
      </TabsList>

      <TabsContent value="write">
        {/* Side by side from lg; on smaller screens Edit and Preview are tabs. */}
        <Tabs defaultValue="edit" className="space-y-4">
          <TabsList aria-label="Write view" className="lg:hidden">
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
          <div className="grid gap-6 lg:grid-cols-2">
            <TabsContent
              value="edit"
              forceMount
              className="min-w-0 data-[state=inactive]:hidden lg:data-[state=inactive]:block"
            >
              <CampaignEditor
                draft={draft}
                onChange={setDraft}
                onSave={() => void save()}
                onReload={reload}
                isDirty={isDirty}
                isSaving={saving}
                isStale={stale}
              />
            </TabsContent>
            <TabsContent
              value="preview"
              forceMount
              className="min-w-0 data-[state=inactive]:hidden lg:data-[state=inactive]:block"
            >
              <PreviewPane {...preview} />
            </TabsContent>
          </div>
        </Tabs>
      </TabsContent>

      <TabsContent value="test">
        <TestSendPanel detail={detail} draft={draft} />
      </TabsContent>

      <TabsContent value="send" className="max-w-lg space-y-4">
        <p className="text-body text-text-muted">
          Sends the saved version to every member who gets{' '}
          {draft.content.kind === 'digest' ? 'the digest' : 'Locatic updates'}{' '}
          and has a verified email. You'll see who it goes to before anything is
          sent.
        </p>
        {detail.sender ? (
          <p className="font-mono text-meta text-text-muted">
            From {detail.sender}
            {detail.replyTo ? ` · replies to ${detail.replyTo}` : ''}
          </p>
        ) : null}
        <SendDialog
          campaignId={detail.id}
          subject={draft.subject}
          kind={draft.content.kind}
          blockedReason={blockedReason}
          onSend={async () => {
            await requestSend({
              campaignId: detail.id,
              expectedRevision: saved.revision,
            })
            toast.success('Sending started.')
          }}
        />
      </TabsContent>
    </Tabs>
  )
}

export function CampaignWorkspace() {
  const { data } = useSuspenseQuery(emailCampaignListQueryOptions())
  const campaigns = data as EmailCampaignSummary[]
  const [selectedId, setSelectedId] = useState<Id<'email_campaigns'> | null>(
    campaigns[0]?.id ?? null,
  )
  const detailQuery = useQuery(emailCampaignQueryOptions(selectedId))
  const detail = (detailQuery.data ?? null) as EmailCampaignDetail | null
  const createCampaign = useCreateEmailCampaign()
  const cancelSend = useCancelEmailSend()
  const resumeSend = useResumeEmailSend()
  const [creating, setCreating] = useState(false)
  const [dirty, setDirty] = useState(false)

  const leaveDraft = () =>
    !dirty ||
    window.confirm('You have unsaved changes. Leave this draft anyway?')

  const select = (campaignId: Id<'email_campaigns'>) => {
    if (campaignId === selectedId || !leaveDraft()) return
    setDirty(false)
    setSelectedId(campaignId)
  }

  const create = async (kind: EmailCampaignKind) => {
    if (!leaveDraft()) return
    setCreating(true)
    try {
      const campaignId = await createCampaign({
        kind,
        title: kind === 'digest' ? 'New digest' : 'New update',
      })
      setDirty(false)
      setSelectedId(campaignId)
    } catch (error) {
      reportActionError(error, { title: "couldn't create the campaign" })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="lx-page-shell">
      <PageHeader title="email campaigns" subtitle="admin" width="wide" />
      <div className="lx-page-scroll">
        <div className="lx-page-width-wide flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="w-full shrink-0 lg:w-72">
            <CampaignList
              campaigns={campaigns}
              selectedId={selectedId}
              onSelect={select}
              onCreate={(kind) => void create(kind)}
              isCreating={creating}
            />
          </div>
          <Card as="section" density="cozy" className="min-w-0 flex-1">
            {!detail ? (
              <p className="py-10 text-center font-mono text-label text-text-muted">
                {selectedId && detailQuery.isLoading
                  ? 'Loading…'
                  : 'Pick a campaign or start a new one.'}
              </p>
            ) : detail.state === 'draft' ? (
              <DraftPanel
                key={detail.id}
                detail={detail}
                onDirtyChange={setDirty}
              />
            ) : (
              <CampaignResults
                key={detail.id}
                detail={detail}
                onCancel={async () => {
                  try {
                    await cancelSend({ campaignId: detail.id })
                    toast.success('Cancelling emails that have not gone out.')
                  } catch (error) {
                    reportActionError(error, { title: "couldn't cancel" })
                  }
                }}
                onResume={async () => {
                  try {
                    await resumeSend({ campaignId: detail.id })
                    toast.success('Sending resumed.')
                  } catch (error) {
                    reportActionError(error, { title: "couldn't resume" })
                  }
                }}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
