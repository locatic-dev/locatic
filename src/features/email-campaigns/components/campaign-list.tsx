import type { Id } from '../../../../convex/_generated/dataModel'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusPill } from '@/components/ui/status-pill'
import {
  CAMPAIGN_STATE_LABELS,
  campaignKindLabel,
  type EmailCampaignKind,
  type EmailCampaignSummary,
  resultsSummary,
} from '../contracts'

export interface CampaignListProps {
  campaigns: EmailCampaignSummary[]
  selectedId: Id<'email_campaigns'> | null
  onSelect: (campaignId: Id<'email_campaigns'>) => void
  onCreate: (kind: EmailCampaignKind) => void
  isCreating: boolean
}

export function CampaignList({
  campaigns,
  selectedId,
  onSelect,
  onCreate,
  isCreating,
}: CampaignListProps) {
  return (
    <Card as="aside" density="flush" aria-labelledby="campaign-list-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 id="campaign-list-title" className="text-eyebrow text-text-muted">
          campaigns
        </h2>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isCreating}
            onClick={() => onCreate('digest')}
          >
            New digest
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={isCreating}
            onClick={() => onCreate('announcement')}
          >
            New update
          </Button>
        </div>
      </div>
      {campaigns.length === 0 ? (
        <p className="px-4 py-6 text-body text-text-muted">No campaigns yet.</p>
      ) : (
        <ul aria-label="Campaigns">
          {campaigns.map((campaign) => (
            <li
              key={campaign.id}
              className="border-b border-line last:border-b-0"
            >
              <button
                type="button"
                className="relative w-full px-4 py-3 text-left transition-colors before:absolute before:inset-y-0 before:left-0 before:w-0.5 hover:bg-state-hover aria-pressed:bg-selected aria-pressed:before:bg-selected-bar"
                aria-pressed={campaign.id === selectedId}
                onClick={() => onSelect(campaign.id)}
              >
                <span className="block truncate font-sans text-label font-medium text-text">
                  {campaign.title}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-meta text-text-muted">
                  <span>{campaignKindLabel(campaign.kind)}</span>
                  <StatusPill status={CAMPAIGN_STATE_LABELS[campaign.state]} />
                </span>
                {campaign.results ? (
                  <span className="mt-1 block font-mono text-meta text-text-muted">
                    {resultsSummary(campaign.results)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
