import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useId, useState } from 'react'

import { Input } from '@/components/ui/input'
import {
  type DraftAudience,
  EMAIL_LIMITS,
  type EmailAudienceMember,
  type EmailCampaignKind,
  type SkipReason,
} from '../contracts'
import { emailMemberSearchQueryOptions } from '../queries'

const SKIP_LABELS: Record<
  NonNullable<SkipReason>,
  (kind: EmailCampaignKind) => string
> = {
  unsubscribed: (kind) =>
    kind === 'digest' ? 'not signed up for the digest' : 'turned updates off',
  unverified: () => 'email not verified',
  inactive: () => 'account inactive',
}

// Native radios (arrow keys, one tab stop) drawn as chips.
const optionClassName =
  'inline-flex min-h-8 cursor-pointer items-center rounded-control border border-control px-3 font-mono text-label text-text-muted transition-colors hover:text-text has-checked:border-selected-bar has-checked:bg-selected has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-focus has-focus-visible:outline-offset-2 pointer-coarse:min-h-11'

export interface AudienceFieldProps {
  kind: EmailCampaignKind
  audience: DraftAudience
  onChange: (audience: DraftAudience) => void
  /**
   * Live skip reasons for the stored campaign's members. They change when a
   * member changes their settings, without a new campaign revision.
   */
  skipReasons: ReadonlyMap<string, SkipReason>
}

/**
 * The To field: everyone who gets this kind of email, or named members.
 * Named members still follow their settings; a chip says when one would be
 * skipped.
 */
export function AudienceField({
  kind,
  audience,
  onChange,
  skipReasons,
}: AudienceFieldProps) {
  const id = useId()
  const [search, setSearch] = useState('')
  const searchQuery = useQuery(emailMemberSearchQueryOptions(search, kind))
  // What search said about members added since the campaign last loaded.
  const [addedReasons, setAddedReasons] = useState<
    ReadonlyMap<string, SkipReason>
  >(() => new Map())
  const members = audience.kind === 'members' ? audience.members : []
  const chosen = new Set(members.map((member) => member.userId))
  const results = (searchQuery.data ?? []).filter(
    (member) => !chosen.has(member.userId),
  )
  const full = members.length >= EMAIL_LIMITS.audienceMembers
  const everyoneLabel =
    kind === 'digest' ? 'All digest subscribers' : 'All members who get updates'
  const reasonFor = (userId: string) =>
    skipReasons.has(userId) ? skipReasons.get(userId) : addedReasons.get(userId)

  const add = ({ skipReason, ...member }: EmailAudienceMember) => {
    setAddedReasons((current) =>
      new Map(current).set(member.userId, skipReason),
    )
    onChange({ kind: 'members', members: [...members, member] })
    setSearch('')
  }

  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-1.5 font-mono text-label text-text-muted">
        To
      </legend>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['everyone', everyoneLabel],
            ['members', 'Specific members'],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={optionClassName}>
            <input
              type="radio"
              name={`${id}-to`}
              value={value}
              className="sr-only"
              checked={audience.kind === value}
              onChange={() =>
                onChange(
                  value === 'everyone'
                    ? { kind: 'everyone' }
                    : { kind: 'members', members },
                )
              }
            />
            {label}
          </label>
        ))}
      </div>

      {audience.kind === 'members' ? (
        <div className="space-y-2.5">
          {members.length > 0 ? (
            <ul aria-label="Chosen members" className="flex flex-wrap gap-2">
              {members.map((member) => {
                const reason = reasonFor(member.userId)
                return (
                  <li
                    key={member.userId}
                    className="inline-flex items-center gap-1.5 rounded-control border border-line py-1 pr-1 pl-2.5"
                  >
                    <span className="text-label text-text">
                      {member.displayName}
                    </span>
                    <span className="font-mono text-meta text-text-muted">
                      @{member.githubUsername}
                    </span>
                    {reason ? (
                      <span className="font-mono text-meta text-danger">
                        {SKIP_LABELS[reason](kind)} · will be skipped
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Remove ${member.displayName}`}
                      className="inline-flex size-6 items-center justify-center rounded-control text-text-muted hover:bg-state-hover hover:text-text pointer-coarse:size-11"
                      onClick={() =>
                        onChange({
                          kind: 'members',
                          members: members.filter(
                            (other) => other.userId !== member.userId,
                          ),
                        })
                      }
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="font-mono text-meta text-danger">
              Add at least one member to send.
            </p>
          )}
          <div>
            <label htmlFor={id} className="sr-only">
              Add a member
            </label>
            <Input
              id={id}
              type="search"
              placeholder={
                full
                  ? `${EMAIL_LIMITS.audienceMembers} members is the limit`
                  : 'Add a member by name or @username'
              }
              value={search}
              disabled={full}
              onChange={(event) => setSearch(event.target.value)}
            />
            {!search.trim() ? null : searchQuery.error ? (
              <p
                role="alert"
                className="mt-1.5 font-mono text-meta text-danger"
              >
                Couldn't search members.{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void searchQuery.refetch()}
                >
                  Retry
                </button>
              </p>
            ) : !searchQuery.data ? (
              <p
                role="status"
                className="mt-1.5 font-mono text-meta text-text-muted"
              >
                Searching…
              </p>
            ) : results.length > 0 ? (
              <ul aria-label="Matching members" className="mt-1.5 space-y-1">
                {results.map((member) => (
                  <li key={member.userId}>
                    <button
                      type="button"
                      className="flex min-h-8 w-full flex-wrap items-baseline gap-2 rounded-control px-2 py-1.5 text-left hover:bg-state-hover pointer-coarse:min-h-11"
                      onClick={() => add(member)}
                    >
                      <span className="text-label text-text">
                        {member.displayName}
                      </span>
                      <span className="font-mono text-meta text-text-muted">
                        @{member.githubUsername}
                      </span>
                      {member.skipReason ? (
                        <span className="font-mono text-meta text-danger">
                          {SKIP_LABELS[member.skipReason](kind)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 font-mono text-meta text-text-muted">
                No members match.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </fieldset>
  )
}
