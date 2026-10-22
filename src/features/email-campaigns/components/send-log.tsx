import { Link } from '@tanstack/react-router'
import { usePaginatedQuery } from 'convex/react'
import { useId } from 'react'

import { api } from '../../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import {
  type EmailSendStatus,
  SEND_STATUS_HINTS,
  SEND_STATUS_LABELS,
  SEND_STATUS_ORDER,
} from '../contracts'
import { headCellClassName, tableClassName } from './table'

const LOG_PAGE_SIZE = 50

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

export interface SendLogProps {
  status: EmailSendStatus | undefined
  onStatusChange: (status: EmailSendStatus | undefined) => void
}

/** Every campaign email: when, to whom, which campaign, and its outcome. */
export function SendLog({ status, onStatusChange }: SendLogProps) {
  const filterId = useId()
  const log = usePaginatedQuery(
    api.emailCampaigns.listSendLog,
    status ? { status } : {},
    { initialNumItems: LOG_PAGE_SIZE },
  )

  return (
    <Card as="section" density="cozy" aria-labelledby={`${filterId}-title`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${filterId}-title`} className="text-eyebrow text-text-muted">
          sent emails
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={filterId}
            className="font-mono text-label text-text-muted"
          >
            Status
          </label>
          <NativeSelect
            id={filterId}
            value={status ?? ''}
            onChange={(event) =>
              onStatusChange(
                SEND_STATUS_ORDER.find((value) => value === event.target.value),
              )
            }
            // Sized by its longest option, so no label is clipped.
            className="h-8 w-auto"
          >
            <option value="">all</option>
            {SEND_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {SEND_STATUS_LABELS[value]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {status ? (
        <p className="mt-2 font-mono text-meta text-text-muted">
          {SEND_STATUS_HINTS[status]}
        </p>
      ) : null}

      {log.status === 'LoadingFirstPage' ? (
        <p className="py-10 text-center font-mono text-label text-text-muted">
          Loading…
        </p>
      ) : log.results.length === 0 ? (
        <p className="mt-4 text-body text-text-muted">
          {status ? 'No emails with this status.' : 'No emails sent yet.'}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className={tableClassName}>
            <thead>
              <tr className="border-b border-line font-mono text-meta text-text-muted">
                <th scope="col" className={headCellClassName}>
                  sent
                </th>
                <th scope="col" className={headCellClassName}>
                  recipient
                </th>
                <th scope="col" className={headCellClassName}>
                  campaign
                </th>
                <th scope="col" className={headCellClassName}>
                  status
                </th>
              </tr>
            </thead>
            <tbody>
              {log.results.map((entry) => (
                <tr key={entry.id} className="border-b border-line align-top">
                  <td className="py-2 pr-4 font-mono text-meta whitespace-nowrap text-text-muted">
                    {formatTime(entry.createdAt)}
                  </td>
                  <td className="min-w-48 py-2 pr-4">
                    <span className="block text-label text-text">
                      {entry.displayName}
                      {entry.githubUsername ? (
                        <span className="ml-1.5 font-mono text-meta text-text-muted">
                          @{entry.githubUsername}
                        </span>
                      ) : null}
                    </span>
                    <span className="block font-mono text-meta break-all text-text-muted">
                      {entry.to ?? 'address not recorded'}
                    </span>
                  </td>
                  <td className="max-w-60 min-w-36 py-2 pr-4">
                    <Link
                      to="/admin/emails/$campaignId"
                      params={{ campaignId: entry.campaignId }}
                      className="block truncate text-label text-text hover:underline"
                    >
                      {entry.campaignTitle}
                    </Link>
                  </td>
                  <td className="min-w-32 py-2 pr-4 font-mono text-meta text-text">
                    <span className="block whitespace-nowrap">
                      {SEND_STATUS_LABELS[entry.status]}
                    </span>
                    {entry.status !== 'queued' &&
                    entry.updatedAt !== entry.createdAt ? (
                      <span className="block whitespace-nowrap text-text-muted">
                        {formatTime(entry.updatedAt)}
                      </span>
                    ) : null}
                    {entry.errorMessage ? (
                      <span className="block text-danger">
                        {entry.errorMessage}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {log.status === 'CanLoadMore' || log.status === 'LoadingMore' ? (
        <Button
          type="button"
          size="sm"
          className="mt-3 pointer-coarse:h-11"
          disabled={log.status === 'LoadingMore'}
          onClick={() => log.loadMore(LOG_PAGE_SIZE)}
        >
          {log.status === 'LoadingMore' ? 'Loading…' : 'Show more'}
        </Button>
      ) : null}
    </Card>
  )
}
