import { Link } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'
import { Switch } from '@/components/ui/switch'

export type EmailStatus = FunctionReturnType<
  typeof api.emailPreferences.myEmailStatus
>
export type EmailCategory = 'product_updates' | 'weekly_digest'

const rowClassName =
  'flex items-center justify-between gap-4 border-b border-line py-3.5'

const ROWS: Array<{
  category: EmailCategory
  key: 'productUpdates' | 'weeklyDigest'
  label: string
  description: string
}> = [
  {
    category: 'product_updates',
    key: 'productUpdates',
    label: 'Locatic updates',
    description:
      'Product news and announcements, a couple of times a month at most.',
  },
  {
    category: 'weekly_digest',
    key: 'weeklyDigest',
    label: 'Weekly digest email',
    description: "Not sending yet; we'll email you when it starts.",
  },
]

export interface EmailPreferencesSectionProps {
  /** Undefined while loading: the switches stay disabled. */
  status: EmailStatus | undefined
  onChange: (category: EmailCategory, subscribed: boolean) => void
  isEmailAdmin?: boolean
}

/**
 * Email preferences, saved one category at a time. A status line appears
 * only when delivery is blocked; turning a switch on does not lift a block.
 */
export function EmailPreferencesSection({
  status,
  onChange,
  isEmailAdmin = false,
}: EmailPreferencesSectionProps) {
  const notice = !status
    ? null
    : !status.emailVerified
      ? 'Verify your email in your account settings to receive email from Locatic.'
      : status.blocked
        ? "Our email provider stopped delivering to this address after a spam report or bounce. Turning this on won't change that; contact us to fix it."
        : null

  return (
    <section aria-labelledby="email-preferences-title" className="mt-8">
      <h2
        id="email-preferences-title"
        className="mb-4 text-eyebrow text-text-muted"
      >
        email
      </h2>
      {ROWS.map(({ category, key, label, description }) => (
        <div key={category} className={rowClassName}>
          {/* The label toggles the switch too: a 44px+ target. */}
          <label
            htmlFor={`email-pref-${category}`}
            className="flex min-h-11 flex-1 cursor-pointer flex-col justify-center"
          >
            <span
              id={`email-pref-${category}-label`}
              className="text-label text-text"
            >
              {label}
            </span>
            <span
              id={`email-pref-${category}-description`}
              className="mt-1 font-sans text-body text-text-muted"
            >
              {description}
            </span>
          </label>
          <Switch
            id={`email-pref-${category}`}
            aria-labelledby={`email-pref-${category}-label`}
            aria-describedby={`email-pref-${category}-description`}
            checked={status?.[key] ?? false}
            disabled={!status}
            onCheckedChange={(checked) => onChange(category, checked)}
          />
        </div>
      ))}
      {notice ? (
        <p role="status" className="mt-4 max-w-120 text-body text-text-muted">
          {notice}
        </p>
      ) : null}
      {isEmailAdmin ? (
        <p className="mt-4">
          <Link
            to="/admin/emails"
            className="font-mono text-label text-text-muted underline hover:text-text"
          >
            Email campaigns
          </Link>
        </p>
      ) : null}
    </section>
  )
}
