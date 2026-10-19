import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useId, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  type DraftAudience,
  EMAIL_LIMITS,
  type EmailAudienceMember,
  type EmailCampaignKind,
} from '../contracts'
import { emailMemberSearchQueryOptions } from '../queries'

const SKIP_LABELS: Record<
  NonNullable<EmailAudienceMember['skipReason']>,
  (kind: EmailCampaignKind) => string
> = {
  unsubscribed: (kind) =>
    kind === 'digest' ? 'not signed up for the digest' : 'turned updates off',
  unverified: () => 'email not verified',
  inactive: () => 'account inactive',
}

const optionClassName =
  'rounded-control border px-3 py-1.5 font-mono text-label transition-colors'

export interface AudienceFieldProps {
  kind: EmailCampaignKind
  audience: DraftAudience
  onChange: (audience: DraftAudience) => void
  disabled?: boolean
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
  disabled = false,
}: AudienceFieldProps) {
  const id = useId()
  const [search, setSearch] = useState('')
  const { data } = useQuery(emailMemberSearchQueryOptions(search, kind))
  const members = audience.kind === 'members' ? audience.members : []
  const chosen = new Set(members.map((member) => member.userId))
  const results = (data ?? []).filter((member) => !chosen.has(member.userId))
  const full = members.length >= EMAIL_LIMITS.audienceMembers
  const everyoneLabel =
    kind === 'digest' ? 'All digest subscribers' : 'All members who get updates'

  const add = (member: EmailAudienceMember) => {
    onChange({ kind: 'members', members: [...members, member] })
    setSearch('')
  }

  return (
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="mb-1.5 font-mono text-label text-text-muted">
        To
      </legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Who">
        {(
          [
            ['everyone', everyoneLabel],
            ['members', 'Specific members'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={audience.kind === value}
            className={cn(
              optionClassName,
              audience.kind === value
                ? 'border-selected-bar bg-selected text-text'
                : 'border-control text-text-muted hover:text-text',
            )}
            onClick={() =>
              onChange(
                value === 'everyone'
                  ? { kind: 'everyone' }
                  : { kind: 'members', members },
              )
            }
          >
            {label}
          </button>
        ))}
      </div>

      {audience.kind === 'members' ? (
        <div className="space-y-2.5">
          {members.length > 0 ? (
            <ul aria-label="Chosen members" className="flex flex-wrap gap-2">
              {members.map((member) => (
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
                  {member.skipReason ? (
                    <span className="font-mono text-meta text-danger">
                      {SKIP_LABELS[member.skipReason](kind)} · will be skipped
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Remove ${member.displayName}`}
                    className="inline-flex size-6 items-center justify-center rounded-control text-text-muted hover:bg-state-hover hover:text-text"
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
              ))}
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
            {search.trim() && results.length > 0 ? (
              <ul aria-label="Matching members" className="mt-1.5 space-y-1">
                {results.map((member) => (
                  <li key={member.userId}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-baseline gap-2 rounded-control px-2 py-1.5 text-left hover:bg-state-hover"
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
            ) : search.trim() && data ? (
              <p className="mt-1.5 font-mono text-meta text-text-muted">
                No members match.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </fieldset>
  )
}
