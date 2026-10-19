import { useCallback, useEffect, useRef, useState } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'

import { getActionErrorMessage, reportActionError } from '@/lib/action-error'
import {
  type CampaignDraft,
  detailToDraft,
  draftToArgs,
  type EmailCampaignDetail,
  hasDraftContent,
  isStaleDraftError,
  sameDraft,
} from './contracts'
import {
  useCreateEmailCampaign,
  useDeleteEmailCampaign,
  useSaveEmailCampaign,
} from './mutations'

export const AUTOSAVE_DELAY_MS = 1_000

export type AutosaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error' }

interface Saved {
  campaignId: Id<'email_campaigns'> | null
  revision: number
  draft: CampaignDraft
}

export interface DraftAutosaveOptions {
  /** The stored campaign, once there is one and it has loaded. */
  detail: EmailCampaignDetail | null
  /** Where a New draft starts; ignored when `detail` is given. */
  initialDraft: CampaignDraft
  /** The first save created the campaign. */
  onCreated: (campaignId: Id<'email_campaigns'>) => void
}

/**
 * Gmail-style drafts. A New draft is stored once it has content; after that,
 * edits save `AUTOSAVE_DELAY_MS` after typing stops. Saves never overlap:
 * an edit made during one saves next, with the revision it returned. A
 * newer revision from someone else pauses autosave (`isStale`) until Reload.
 */
export function useDraftAutosave({
  detail,
  initialDraft,
  onCreated,
}: DraftAutosaveOptions) {
  const createCampaign = useCreateEmailCampaign()
  const saveCampaign = useSaveEmailCampaign()
  const deleteCampaign = useDeleteEmailCampaign()
  const [saved, setSavedState] = useState<Saved>(() => ({
    campaignId: detail?.id ?? null,
    revision: detail?.revision ?? 0,
    draft: detail ? detailToDraft(detail) : initialDraft,
  }))
  // Updated with the state, not on the next render: Discard reads it right
  // after a create resolves.
  const savedRef = useRef(saved)
  const setSaved = useCallback((next: Saved) => {
    savedRef.current = next
    setSavedState(next)
  }, [])
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [draft, setDraft] = useState<CampaignDraft>(saved.draft)
  const [status, setStatus] = useState<AutosaveStatus>({ kind: 'idle' })
  const [isStale, setStale] = useState(false)
  // Read inside async work, where state would be stale.
  const latestDraft = useRef(draft)
  latestDraft.current = draft
  const inFlight = useRef<Promise<void> | null>(null)
  // Kept in a ref so `saveNow` stays stable and re-renders (the preview
  // updating) do not restart the autosave timer.
  const onCreatedRef = useRef(onCreated)
  onCreatedRef.current = onCreated
  const discarded = useRef(false)
  // The snapshot the last save failed on. Autosave does not retry it (a
  // validation or permission error would fail again); an edit or Retry does.
  const [failedDraft, setFailedDraft] = useState<CampaignDraft | null>(null)
  const isDirty = !sameDraft(draft, saved.draft)

  const saveNow = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      // One save at a time; this edit saves after it (the effect re-runs).
      await inFlight.current
      return
    }
    const submitted = latestDraft.current
    const base = savedRef.current
    if (discarded.current || sameDraft(submitted, base.draft)) return
    if (!base.campaignId && !hasDraftContent(submitted)) return
    const run = (async () => {
      setStatus({ kind: 'saving' })
      try {
        const args = draftToArgs(submitted)
        if (!base.campaignId) {
          const campaignId = await createCampaign(args)
          setSaved({ campaignId, revision: 1, draft: submitted })
          // An editor that was left or discarded meanwhile must not navigate.
          if (mounted.current && !discarded.current) {
            onCreatedRef.current(campaignId)
          }
        } else {
          const revision = await saveCampaign({
            campaignId: base.campaignId,
            expectedRevision: base.revision,
            ...args,
          })
          setSaved({ campaignId: base.campaignId, revision, draft: submitted })
        }
        setFailedDraft(null)
        setStatus({ kind: 'saved', at: Date.now() })
      } catch (error) {
        if (isStaleDraftError(getActionErrorMessage(error))) {
          setStale(true)
          setStatus({ kind: 'idle' })
        } else {
          setStatus({ kind: 'error' })
          setFailedDraft(submitted)
          reportActionError(error, { title: "couldn't save the draft" })
        }
      }
    })()
    inFlight.current = run
    try {
      await run
    } finally {
      inFlight.current = null
    }
  }, [createCampaign, saveCampaign, setSaved])

  // Autosave after a pause in typing, never while stale, and not again for
  // a snapshot that just failed.
  useEffect(() => {
    if (!isDirty || isStale || status.kind === 'saving') return
    if (failedDraft && sameDraft(draft, failedDraft)) return
    const timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, failedDraft, isDirty, isStale, saveNow, status.kind])

  // Someone else saved: follow along when clean, pause when there are
  // edits. Ignored while our own save is in flight; its result catches up.
  useEffect(() => {
    if (!detail || inFlight.current || detail.revision <= saved.revision) {
      return
    }
    if (isDirty) {
      setStale(true)
      return
    }
    const next = detailToDraft(detail)
    setSaved({ campaignId: detail.id, revision: detail.revision, draft: next })
    setDraft(next)
  }, [detail, isDirty, saved.revision, setSaved])

  const reload = () => {
    if (!detail) return
    const next = detailToDraft(detail)
    setSaved({ campaignId: detail.id, revision: detail.revision, draft: next })
    setDraft(next)
    setStale(false)
    setStatus({ kind: 'idle' })
  }

  /**
   * Stops autosave and deletes the stored draft, waiting for a save in
   * flight first so a create that lands late is deleted too. Returns false
   * if the delete failed.
   */
  const discard = async () => {
    discarded.current = true
    await inFlight.current
    const campaignId = savedRef.current.campaignId
    if (!campaignId) return true
    try {
      await deleteCampaign({ campaignId })
      return true
    } catch (error) {
      discarded.current = false
      reportActionError(error, { title: "couldn't delete the draft" })
      return false
    }
  }

  return {
    draft,
    setDraft,
    saved,
    status,
    isDirty,
    isStale,
    saveNow,
    reload,
    discard,
  }
}
