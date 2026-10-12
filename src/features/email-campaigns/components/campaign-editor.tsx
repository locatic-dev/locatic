import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  EMAIL_LIMITS,
  formatCount,
  type CampaignDraft,
  type EmailCampaignContent,
  type EmailProjectSelection,
} from '../contracts'
import { emailProjectSearchQueryOptions } from '../queries'

const labelClassName = 'mb-1.5 block font-mono text-label text-text-muted'
const hintClassName = 'mt-1.5 font-mono text-meta text-text-muted'

interface FieldProps {
  label: string
  value: string
  limit: number
  hint?: ReactNode
  children: (props: {
    id: string
    'aria-describedby': string
    'aria-invalid': boolean
  }) => ReactNode
}

/** A labelled field with a live character count against its limit. */
function Field({ label, value, limit, hint, children }: FieldProps) {
  const id = useId()
  const countId = `${id}-count`
  const over = value.length > limit
  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      {children({ id, 'aria-describedby': countId, 'aria-invalid': over })}
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
        {hint ? <p className={cn(hintClassName, 'mt-0')}>{hint}</p> : <span />}
        <p
          id={countId}
          className={cn(
            'font-mono text-meta',
            over ? 'text-danger' : 'text-text-muted',
          )}
        >
          {formatCount(value.length)} / {formatCount(limit)}
        </p>
      </div>
    </div>
  )
}

type DigestContent = Extract<EmailCampaignContent, { kind: 'digest' }>

function DigestPicks({
  content,
  onChange,
}: {
  content: DigestContent
  onChange: (content: DigestContent) => void
}) {
  const [search, setSearch] = useState('')
  const searchId = useId()
  const { data } = useQuery(emailProjectSearchQueryOptions(search))
  const chosen = new Set(content.projects.map((project) => project.projectId))
  const results = ((data ?? []) as EmailProjectSelection[]).filter(
    (project) => !chosen.has(project.projectId),
  )
  const full = content.projects.length >= EMAIL_LIMITS.projects

  return (
    <section aria-labelledby={`${searchId}-title`} className="space-y-4">
      <h3 id={`${searchId}-title`} className="text-eyebrow text-text-muted">
        projects and discussions
      </h3>
      <ul className="space-y-2" aria-label="Chosen projects">
        {content.projects.map((project) => (
          <li
            key={project.projectId}
            className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2"
          >
            <span className="min-w-0 truncate text-label text-text">
              {project.fullName}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Remove ${project.fullName}`}
              onClick={() =>
                onChange({
                  ...content,
                  projects: content.projects.filter(
                    (item) => item.projectId !== project.projectId,
                  ),
                })
              }
            >
              remove
            </Button>
          </li>
        ))}
        {content.discussions.map((discussion) => (
          <li
            key={discussion.commentId}
            className="flex items-center justify-between gap-3 rounded-control border border-line px-3 py-2"
          >
            <span className="min-w-0 truncate text-label text-text">
              {discussion.title}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={`Remove ${discussion.title}`}
              onClick={() =>
                onChange({
                  ...content,
                  discussions: content.discussions.filter(
                    (item) => item.commentId !== discussion.commentId,
                  ),
                })
              }
            >
              remove
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <label htmlFor={searchId} className={labelClassName}>
          Find a project
        </label>
        <Input
          id={searchId}
          value={search}
          disabled={full}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="name or description"
        />
        <p className={hintClassName}>
          {full
            ? `Up to ${EMAIL_LIMITS.projects} projects.`
            : 'Only public projects appear.'}
        </p>
        {search.trim() && !full ? (
          <ul className="mt-2 space-y-1">
            {results.map((project) => (
              <li key={project.projectId}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`Add ${project.fullName}`}
                  onClick={() => {
                    onChange({
                      ...content,
                      projects: [...content.projects, project],
                    })
                    setSearch('')
                  }}
                >
                  + {project.fullName}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}

export interface CampaignEditorProps {
  draft: CampaignDraft
  onChange: (draft: CampaignDraft) => void
  onSave: () => void
  onReload: () => void
  isDirty: boolean
  isSaving: boolean
  /** Someone else saved a newer version while this one has local edits. */
  isStale: boolean
}

export function CampaignEditor({
  draft,
  onChange,
  onSave,
  onReload,
  isDirty,
  isSaving,
  isStale,
}: CampaignEditorProps) {
  const ctaLabelId = useId()
  const ctaUrlId = useId()
  const content = draft.content
  const setContent = (next: EmailCampaignContent) =>
    onChange({ ...draft, content: next })
  const setCta = (label: string, url: string) =>
    setContent({
      ...content,
      cta: label || url ? { label, url } : null,
    })

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (isDirty && !isSaving) onSave()
      }}
    >
      {isStale ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-danger px-3 py-2"
        >
          <p className="text-body text-text">
            Someone else changed this draft. Reload to see their version.
          </p>
          <Button type="button" size="sm" onClick={onReload}>
            Reload
          </Button>
        </div>
      ) : null}

      <Field label="Title" value={draft.title} limit={EMAIL_LIMITS.title}>
        {(props) => (
          <Input
            {...props}
            value={draft.title}
            onChange={(event) =>
              onChange({ ...draft, title: event.target.value })
            }
          />
        )}
      </Field>
      <Field label="Subject" value={draft.subject} limit={EMAIL_LIMITS.subject}>
        {(props) => (
          <Input
            {...props}
            value={draft.subject}
            onChange={(event) =>
              onChange({ ...draft, subject: event.target.value })
            }
          />
        )}
      </Field>
      <Field
        label="Preview text"
        value={draft.preheader}
        limit={EMAIL_LIMITS.preheader}
        hint="Shown after the subject in most inboxes."
      >
        {(props) => (
          <Input
            {...props}
            value={draft.preheader}
            onChange={(event) =>
              onChange({ ...draft, preheader: event.target.value })
            }
          />
        )}
      </Field>
      <Field
        label="Message"
        value={content.body}
        limit={EMAIL_LIMITS.body}
        hint="**bold**, [links](https://…), and - lists"
      >
        {(props) => (
          <Textarea
            {...props}
            rows={12}
            className="min-h-60 font-sans"
            value={content.body}
            onChange={(event) =>
              setContent({ ...content, body: event.target.value })
            }
          />
        )}
      </Field>

      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-eyebrow text-text-muted">
          button (optional)
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={ctaLabelId} className={labelClassName}>
              Button text
            </label>
            <Input
              id={ctaLabelId}
              value={content.cta?.label ?? ''}
              maxLength={EMAIL_LIMITS.ctaLabel}
              onChange={(event) =>
                setCta(event.target.value, content.cta?.url ?? '')
              }
            />
          </div>
          <div>
            <label htmlFor={ctaUrlId} className={labelClassName}>
              Button link
            </label>
            <Input
              id={ctaUrlId}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={content.cta?.url ?? ''}
              maxLength={EMAIL_LIMITS.url}
              onChange={(event) =>
                setCta(content.cta?.label ?? '', event.target.value)
              }
            />
          </div>
        </div>
      </fieldset>

      {content.kind === 'digest' ? (
        <DigestPicks content={content} onChange={setContent} />
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!isDirty || isSaving}>
          {isSaving ? 'Saving…' : 'Save draft'}
        </Button>
      </div>
    </form>
  )
}
