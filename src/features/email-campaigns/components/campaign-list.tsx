import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import type { Id } from '../../../../convex/_generated/dataModel'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusPill } from '@/components/ui/status-pill'
import { reportActionError } from '@/lib/action-error'
import {
  CAMPAIGN_STATE_LABELS,
  campaignKindLabel,
  type EmailCampaignSummary,
  formatCount,
  resultsSummary,
} from '../contracts'
import { useDeleteEmailCampaigns } from '../mutations'
import { emailCampaignListQueryOptions } from '../queries'

type CampaignId = Id<'email_campaigns'>

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

/** The last column: when edited, when it sends, or how it went. */
function campaignWhen(campaign: EmailCampaignSummary) {
  if (campaign.state === 'draft') return formatDate(campaign.updatedAt)
  if (campaign.sendAt !== null) return `sends ${formatDate(campaign.sendAt)}`
  return campaign.results
    ? resultsSummary(campaign.results)
    : formatDate(campaign.updatedAt)
}

const headCellClassName = 'py-2 pr-4 font-normal'

export interface CampaignTableProps {
  title: string
  campaigns: EmailCampaignSummary[]
  emptyText: string
  /** Drafts only: row checkboxes for bulk delete. */
  selection?: {
    selected: ReadonlySet<CampaignId>
    onToggle: (campaignId: CampaignId) => void
    onToggleAll: () => void
  }
  actions?: ReactNode
}

export function CampaignTable({
  title,
  campaigns,
  emptyText,
  selection,
  actions,
}: CampaignTableProps) {
  const titleId = `campaigns-${title}`
  const allSelected =
    !!selection &&
    campaigns.length > 0 &&
    campaigns.every((campaign) => selection.selected.has(campaign.id))
  return (
    <Card as="section" density="cozy" aria-labelledby={titleId}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-eyebrow text-text-muted">
          {title}
        </h2>
        {actions}
      </div>
      {campaigns.length === 0 ? (
        <p className="mt-3 text-body text-text-muted">{emptyText}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line font-mono text-meta text-text-muted">
                {selection ? (
                  <th scope="col" className="w-8 py-2 pr-2 font-normal">
                    <input
                      type="checkbox"
                      aria-label={`Select all ${title}`}
                      checked={allSelected}
                      onChange={selection.onToggleAll}
                    />
                  </th>
                ) : null}
                <th scope="col" className={headCellClassName}>
                  title
                </th>
                <th scope="col" className={headCellClassName}>
                  type
                </th>
                <th scope="col" className={headCellClassName}>
                  status
                </th>
                <th scope="col" className={headCellClassName}>
                  {selection ? 'last edited' : 'results'}
                </th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-line">
                  {selection ? (
                    <td className="py-2.5 pr-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${campaign.title}`}
                        checked={selection.selected.has(campaign.id)}
                        onChange={() => selection.onToggle(campaign.id)}
                      />
                    </td>
                  ) : null}
                  <td className="max-w-80 py-2.5 pr-4">
                    <Link
                      to="/admin/emails/$campaignId"
                      params={{ campaignId: campaign.id }}
                      className="block truncate text-label font-medium text-text hover:underline"
                    >
                      {campaign.title}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-meta text-text-muted">
                    {campaignKindLabel(campaign.kind)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusPill
                      status={CAMPAIGN_STATE_LABELS[campaign.state]}
                    />
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-meta whitespace-nowrap text-text-muted">
                    {campaignWhen(campaign)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/** Drafts and sent campaigns, each row linking to its own page. */
export function CampaignIndex() {
  const { data: campaigns } = useSuspenseQuery(emailCampaignListQueryOptions())
  const deleteCampaigns = useDeleteEmailCampaigns()
  const [selected, setSelected] = useState<ReadonlySet<CampaignId>>(
    () => new Set(),
  )
  const [deleting, setDeleting] = useState(false)
  const drafts = campaigns.filter((campaign) => campaign.state === 'draft')
  const sent = campaigns.filter((campaign) => campaign.state !== 'draft')
  // Only drafts still listed count; one deleted elsewhere drops out.
  const chosen = drafts.filter((campaign) => selected.has(campaign.id))

  const toggle = (campaignId: CampaignId) =>
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(campaignId)) next.add(campaignId)
      return next
    })

  const remove = async () => {
    const noun = chosen.length === 1 ? 'draft' : 'drafts'
    if (
      !window.confirm(
        `Delete ${formatCount(chosen.length)} ${noun}? This can't be undone.`,
      )
    ) {
      return
    }
    setDeleting(true)
    try {
      const { deleted } = await deleteCampaigns({
        campaignIds: chosen.map((campaign) => campaign.id),
      })
      setSelected(new Set())
      toast.success(
        `${formatCount(deleted)} ${deleted === 1 ? 'draft' : 'drafts'} deleted.`,
      )
    } catch (error) {
      reportActionError(error, { title: "couldn't delete the drafts" })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <CampaignTable
        title="drafts"
        campaigns={drafts}
        emptyText="No drafts. Start a new update or digest."
        selection={{
          selected,
          onToggle: toggle,
          onToggleAll: () =>
            setSelected(
              chosen.length === drafts.length
                ? new Set()
                : new Set(drafts.map((campaign) => campaign.id)),
            ),
        }}
        actions={
          chosen.length > 0 ? (
            <Button
              type="button"
              size="sm"
              disabled={deleting}
              onClick={() => void remove()}
            >
              {deleting
                ? 'Deleting…'
                : `Delete ${formatCount(chosen.length)} ${
                    chosen.length === 1 ? 'draft' : 'drafts'
                  }`}
            </Button>
          ) : null
        }
      />
      <CampaignTable
        title="sent"
        campaigns={sent}
        emptyText="Nothing sent yet."
      />
    </div>
  )
}
