# Community Email (Simplified) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace PR #32's Resend-mirroring delivery stack with the simplified design: Convex owns the member list and preferences, and `@convex-dev/resend` delivers one email per eligible member, with reliable unsubscribes and no duplicate sends.

**Architecture:** Read [`2026-10-11-community-email-design.md`](2026-10-11-community-email-design.md) first; it holds the decisions (D1–D9) and the reasons. Campaign drafts, preferences, consent log and per-recipient send records live in Convex. A send renders once in a Node action, then a chain of scheduled mutations pages through `users`, enqueues emails through the component and writes `email_sends` rows in the same transaction. The component handles batching, retries and webhooks; a small reconciliation cron copies outcomes the component does not report through its callback.

**Tech Stack:** TanStack Start, React 19, Convex 1.46 (`convex-test`, Vitest), `@convex-dev/resend@0.2.8`, `convex-helpers`, `@react-email/render`, `react-markdown`, Clerk (`@clerk/backend`), Tailwind v4, Playwright.

**Branch and worktree:** work on `feat/community-email` in the main worktree (agreed 2026-10-11).

**Commits:** the repository owner's rule is that nothing is committed unless they ask in the current conversation. "Checkpoint" steps below mark where a commit would go; run the listed verification, then commit only if asked.

**Conventions to follow throughout** (from `AGENTS.md`, `convex/AGENTS.md`):

- Public Convex functions are client contracts: authenticate and authorize in every handler; use `internal*` for jobs, webhooks and helpers. Declare `args` and `returns` validators.
- Query through indexes; no unbounded `.collect()` on request paths; paginate.
- Never edit `convex/_generated/` or `src/routeTree.gen.ts`; regenerate with `pnpm exec convex codegen` and the route generator (runs in `pnpm dev`/build).
- `@/` imports in `src/`; type-only imports stay type-only; semantic Tailwind tokens; no arbitrary values (enforced by `pnpm check`).
- Extracted server logic gets focused tests under `convex/lib/__tests__/`.
- Narrow checks while iterating: `pnpm exec vitest run <file>`; `pnpm typecheck`; finish with `pnpm ci:quality` and `pnpm ci:build`.

**Verified component facts (0.2.8 source, checked 2026-10-11):**

- `resend.sendEmail(ctx, { from, to, subject, html, text, replyTo?: string[], headers?: { name, value }[], idempotencyKey? })` works in a mutation and returns an `EmailId` (`string` brand).
- `resend.cancelEmail(ctx, emailId)` throws `"Email has already been sent"` unless the component status is `waiting` or `queued`.
- `resend.status(ctx, emailId)` returns `{ status: 'waiting'|'queued'|'cancelled'|'sent'|'delivered'|'delivery_delayed'|'bounced'|'failed', errorMessage, bounced, complained, failed, ... } | null`, from a query, mutation or action context.
- `onEmailEvent` receives `vOnEmailEventArgs` = `{ id: EmailId, event: EmailEvent }`; `event.type` is one of `email.sent|delivered|delivery_delayed|bounced|complained|failed|opened|clicked`. API failures and exhausted retries mark emails `failed` with **no** callback.
- Tests register the component with `import resendTest from '@convex-dev/resend/test'; resendTest.register(t)`, like `rateLimiterTest.register(t)` in `convex/project_reactions.test.ts`.

---

## Phase 1: Clear the old stack

### Task 1: Remove PR #32's contact sync and broadcast delivery

The old modules are replaced wholesale, so delete them first and keep the build green with the smallest stubs. The admin page temporarily shows a placeholder; Task 15 rebuilds it.

**Files:**

- Delete: `convex/emailContacts.ts`, `convex/emailContacts.test.ts`, `convex/emailDelivery.ts`, `convex/emailDelivery.test.ts`, `convex/emailDeliveryActions.test.ts`, `convex/emailDeliveryState.ts`, `convex/emailEvents.ts`, `convex/emailEvents.test.ts`, `convex/emailReviewRegressions.test.ts`, `convex/lib/email_contacts.ts`, `convex/lib/resend_contract.ts`, `convex/lib/email_function_refs.ts`, `src/integrations/convex/email-function-refs.ts`
- Delete: `src/features/email-campaigns/components/campaign-workspace.tsx`, `src/features/email-campaigns/__tests__/campaign-workspace.test.tsx`, `src/features/email-campaigns/mutations.ts`, `src/features/email-campaigns/queries.ts`, `src/features/email-campaigns/contracts.ts`
- Modify: `convex/crons.ts` (remove the four email crons, including the digest cron for now; Task 12 re-adds the digest and adds the new ones)
- Modify: `convex/http.ts` (remove the `/resend/webhooks` route, `getResendEventEmail`, `getResendSuppression`, the `svix` import; keep `getPrimaryEmail`)
- Modify: `convex/users.ts` (remove every `upsertLocalEmailContact`, `enqueueProviderContactCleanup`, `emailRefs` use and the `email_contacts` lookup in `scrubDeletedAccount`; restore `updateNotificationPrefs` to patch `notificationPrefs: args` only; keep `primaryEmailVerified` on `upsertFromClerkWebhook` for now)
- Modify: `convex/emailCampaigns.ts`, `convex/emailRender.ts`, `convex/emailDigest.ts`, `convex/emailCampaigns.test.ts`, `convex/emailDigest.test.ts` (replace `emailRefs.*` with generated `api.*`/`internal.*`; delete `commitReview`, `requestSend`, `validateDispatchAudience`, `getReviewInput`, `listRunRecipients`, `getLatestRun` and their tests; `get` returns `latestRun: null` until Task 9)
- Modify: `convex/schema.ts` (drop `email_contacts`, `email_contact_cleanups`, `email_campaign_runs`, `email_campaign_recipients`; keep `users.emailSubscription` until Task 2), `convex/lib/validators.ts` (drop the run, segment, broadcast, suppression, contact-sync and cleanup validators)
- Modify: `src/routes/_app/admin/emails.tsx` (placeholder component, no loader), `src/integrations/convex/query-options.ts` and `src/features/settings/queries.ts` (remove the email contact status and campaign query options), `src/routes/_app/settings.tsx` (remove the email sync status paragraph and its query)
- Modify: `src/routes/__tests__/private-loader-gating.test.ts` (drop the admin-emails loader expectation if it asserts the removed loader)
- Keep `package.json` unchanged here: `@react-email/render` stays, `resend` is removed in Task 3, and `svix` stays (it predates PR #32; only this PR's Resend route imported it).

**Step 1: Clear development data in the removed tables.** In the Convex dashboard for the development deployment, delete all documents in `email_contacts`, `email_contact_cleanups`, `email_campaign_runs`, `email_campaign_recipients` and `email_campaigns` (the old content shape will not validate later). Expected: tables empty. Never touch production.

**Step 2: Delete and edit the files listed above.** Use `git grep -n "emailRefs\|email_contacts\|emailClientRefs\|email_function_refs\|resend_contract\|emailDeliveryState\|emailContacts\|emailEvents" -- convex src playwright` until it returns nothing outside `docs/`.

**Step 3: Regenerate bindings.** Run: `pnpm exec convex codegen`. Expected: `convex/_generated/api.d.ts` no longer lists the deleted modules, and `server.d.ts`/`server.js` keep the `env` export present on `main` (if `env` disappears, the CLI used is not the repo's; run it via `pnpm exec`).

**Step 4: Verify.** Run: `pnpm typecheck && pnpm exec vitest run convex src/routes`. Expected: no type errors; remaining tests pass.

**Step 5: Checkpoint.** `refactor(email): remove Resend list mirroring and broadcast delivery`.

---

## Phase 2: Data model and component

### Task 2: Schema for the simplified design

**Files:**

- Modify: `convex/schema.ts`, `convex/lib/validators.ts`, `convex/lib/viewer.ts:73-90`, `convex/users.ts:159-168` (viewer return validator), `convex/users.ts` (`upsertFromClerkWebhook` arg rename), `convex/http.ts` (pass `emailVerified`)
- Modify: `convex/__tests__/fixtures.helpers.ts` only if `seedUser` must set new fields explicitly (it spreads `createDefaultViewerProfile`, so it should inherit them)
- Test: `convex/lib/__tests__/viewer.test.ts`

**Step 1: Write the failing test** in `convex/lib/__tests__/viewer.test.ts`:

```ts
it('creates new viewers subscribed to product updates with unverified email', () => {
  const profile = createDefaultViewerProfile({
    clerkId: 'user_1',
    email: 'ada@example.test',
    githubId: 1,
    githubUsername: 'ada',
    githubUrl: 'https://github.com/ada',
    avatarUrl: '',
    displayName: 'Ada',
  })
  expect(profile.notificationPrefs.productUpdates).toBe(true)
  expect(profile.notificationPrefs.weeklyDigest).toBe(false)
  expect(profile.emailVerified).toBe(false)
  expect(profile).not.toHaveProperty('emailSubscription')
})
```

**Step 2: Run it.** `pnpm exec vitest run convex/lib/__tests__/viewer.test.ts`. Expected: FAIL (`productUpdates` undefined).

**Step 3: Implement.**

In `convex/lib/validators.ts` add (and delete the old `emailCampaignContentValidator`, `emailCampaignStateValidator` and `emailCampaignRunStageValidator`):

```ts
export const emailCategoryValidator = v.union(
  v.literal('product_updates'),
  v.literal('weekly_digest'),
)

export const emailPreferenceSourceValidator = v.union(
  v.literal('settings'),
  v.literal('unsubscribe_link'),
  v.literal('one_click'),
  v.literal('complaint'),
  v.literal('backfill'),
  v.literal('signup_default'),
)

export const emailCampaignStateValidator = v.union(
  v.literal('draft'),
  v.literal('sending'),
  v.literal('sent'),
  v.literal('cancelled'),
)

export const emailSendStatusValidator = v.union(
  v.literal('queued'),
  v.literal('sent'),
  v.literal('delivered'),
  v.literal('bounced'),
  v.literal('complained'),
  v.literal('failed'),
  v.literal('cancelled'),
)

export const emailCtaValidator = v.union(
  v.object({ label: v.string(), url: v.string() }),
  v.null(),
)

export const emailCampaignContentValidator = v.union(
  v.object({
    kind: v.literal('announcement'),
    body: v.string(),
    cta: emailCtaValidator,
  }),
  v.object({
    kind: v.literal('digest'),
    body: v.string(),
    cta: emailCtaValidator,
    periodKey: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
    projects: v.array(emailProjectSelectionValidator),
    discussions: v.array(emailDiscussionSelectionValidator),
  }),
)

export const emailCampaignSentValidator = v.object({
  revision: v.number(),
  html: v.string(),
  text: v.string(),
  startedAt: v.number(),
  startedBy: v.id('users'),
  cursor: v.union(v.string(), v.null()),
  lastBatchAt: v.number(),
  enqueuedAt: v.optional(v.number()),
})
```

`emailCampaignKindValidator` is no longer needed (kind lives inside `content`); delete it and its uses.

In `convex/schema.ts`, in `users`: remove `emailSubscription`; add `emailVerified: v.optional(v.boolean())` and `emailChangedAt: v.optional(v.number())`; add `productUpdates: v.optional(v.boolean())` inside `notificationPrefs`. Replace the `email_campaigns` table and add the two new tables:

```ts
email_campaigns: defineTable({
  title: v.string(),
  subject: v.string(),
  preheader: v.string(),
  revision: v.number(),
  templateVersion: v.number(),
  state: emailCampaignStateValidator,
  content: emailCampaignContentValidator,
  preparationDiagnostics: v.array(v.string()),
  sent: v.optional(emailCampaignSentValidator),
  createdBy: v.id('users'),
  updatedBy: v.id('users'),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_updated_at', ['updatedAt'])
  .index('by_state_and_updated_at', ['state', 'updatedAt'])
  .index('by_content_kind_and_period_key', ['content.kind', 'content.periodKey']),

email_sends: defineTable({
  campaignId: v.id('email_campaigns'),
  userId: v.id('users'),
  emailId: v.string(),
  status: emailSendStatusValidator,
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_campaign_and_user', ['campaignId', 'userId'])
  .index('by_campaign_and_status', ['campaignId', 'status'])
  .index('by_email_id', ['emailId'])
  .index('by_user_and_status', ['userId', 'status'])
  .index('by_status_and_updated_at', ['status', 'updatedAt']),

email_preference_changes: defineTable({
  userId: v.id('users'),
  category: emailCategoryValidator,
  subscribed: v.boolean(),
  source: emailPreferenceSourceValidator,
  changedAt: v.number(),
}).index('by_user_and_changed_at', ['userId', 'changedAt']),
```

(`by_state_and_updated_at` serves the stalled-send check; `by_campaign_and_status` serves results counts and admin cancel.)

In `createDefaultViewerProfile` (`convex/lib/viewer.ts`): remove `emailSubscription`; add `emailVerified: false` at the top level and `productUpdates: true` in `notificationPrefs`. Add `productUpdates: v.optional(v.boolean())` to the viewer return validator in `convex/users.ts:159`, and return `productUpdates: viewer.notificationPrefs.productUpdates ?? true` where the viewer is shaped (`convex/users.ts:345`).

In `upsertFromClerkWebhook`: rename the arg `primaryEmailVerified` to `emailVerified`; on insert spread the default profile and set `emailVerified: args.emailVerified`; on update set `emailVerified` and, when `normalizeEmailAddress(args.email) !== normalizeEmailAddress(existingViewer.email)`, also `emailChangedAt: now` (Task 10 adds the send cancellation). Delete every `emailSubscription` write. Update the call in `convex/http.ts` to pass `emailVerified: primaryEmail.verified`. Move `normalizeEmailAddress` and `isUsableEmailAddress` (from the deleted `lib/email_contacts.ts`) into a new `convex/lib/email_address.ts`.

**Step 4: Run tests and typecheck.** `pnpm exec convex codegen && pnpm exec vitest run convex/lib/__tests__/viewer.test.ts convex/users.test.ts && pnpm typecheck`. Expected: PASS. Fix every compile error the new `content` union causes in `convex/emailCampaigns.ts`, `convex/emailDigest.ts`, `convex/lib/email_campaigns.ts` and the template by following Task 4's shape; if that work grows, stub with `// Task 4` TODOs that throw, and keep tests that exercise them skipped until Task 4.

**Step 5: Checkpoint.** `feat(email): add preference, send and consent schema`.

### Task 3: Register `@convex-dev/resend` and a configured client

**Files:**

- Modify: `package.json` (add `"@convex-dev/resend": "0.2.8"`, `"convex-helpers": "^0.1.128"`; remove `"resend"`), `pnpm-lock.yaml` (via install)
- Modify: `convex/convex.config.ts`
- Create: `convex/lib/resend.ts`
- Modify: `convex/lib/email_provider.ts` (configuration only)
- Test: `convex/lib/__tests__/resend.test.ts`

**Step 1: Install.** `pnpm add @convex-dev/resend@0.2.8 convex-helpers@^0.1.128 && pnpm remove resend`. Expected: lockfile updated, no peer warnings for `convex`/`convex-helpers`.

**Step 2: Register the component** in `convex/convex.config.ts`:

```ts
import { defineApp } from 'convex/server'
import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'
import resend from '@convex-dev/resend/convex.config.js'

const app = defineApp()
app.use(rateLimiter)
app.use(resend)

export default app
```

Run `pnpm exec convex codegen`. Expected: `components.resend` appears in `convex/_generated/api.d.ts`.

**Step 3: Write the failing test** `convex/lib/__tests__/resend.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getEmailConfig, isLiveDelivery } from '../email_provider'

afterEach(() => vi.unstubAllEnvs())

describe('email configuration', () => {
  it('keeps the component in test mode unless a sending switch is on', () => {
    expect(isLiveDelivery()).toBe(false)
    vi.stubEnv('EMAIL_TEST_SENDING_ENABLED', 'true')
    expect(isLiveDelivery()).toBe(true)
  })

  it('reports missing sender configuration', () => {
    vi.stubEnv('EMAIL_FROM', 'Locatic <updates@locatic.dev>')
    expect(getEmailConfig()).toBeNull()
    vi.stubEnv('EMAIL_REPLY_TO', 'hello@locatic.dev')
    vi.stubEnv('SITE_URL', 'https://locatic.dev')
    expect(getEmailConfig()).toEqual({
      from: 'Locatic <updates@locatic.dev>',
      replyTo: 'hello@locatic.dev',
      siteUrl: 'https://locatic.dev',
      postalAddress: null,
    })
  })
})
```

**Step 4: Implement** `convex/lib/email_provider.ts` (replace its contents):

```ts
export interface EmailConfig {
  from: string
  replyTo: string
  siteUrl: string
  postalAddress: string | null
}

export function getEmailConfig(): EmailConfig | null {
  const from = process.env.EMAIL_FROM?.trim()
  const replyTo = process.env.EMAIL_REPLY_TO?.trim()
  const siteUrl = process.env.SITE_URL?.trim().replace(/\/+$/, '')
  if (!from || !replyTo || !siteUrl) return null
  return {
    from,
    replyTo,
    siteUrl,
    postalAddress: process.env.EMAIL_POSTAL_ADDRESS?.trim() || null,
  }
}

export function isCampaignSendingEnabled() {
  return process.env.EMAIL_SENDING_ENABLED === 'true'
}

export function isTestSendingEnabled() {
  return process.env.EMAIL_TEST_SENDING_ENABLED === 'true'
}

// The component's test mode only restricts recipients to Resend's test
// addresses; it is not a mock. Leave it on unless a sending switch is on.
export function isLiveDelivery() {
  return isCampaignSendingEnabled() || isTestSendingEnabled()
}
```

Create `convex/lib/resend.ts`:

```ts
import { Resend } from '@convex-dev/resend'

import { components, internal } from '../_generated/api'
import { isLiveDelivery } from './email_provider'

// Built per call so tests and env changes take effect without module reloads.
export function getResend() {
  return new Resend(components.resend, {
    testMode: !isLiveDelivery(),
    onEmailEvent: internal.emailSends.handleEmailEvent,
  })
}
```

(`internal.emailSends.handleEmailEvent` is created in Task 11; until then create `convex/emailSends.ts` with an `internalMutation` named `handleEmailEvent` that takes `vOnEmailEventArgs` and returns `null`.)

**Step 5: Run.** `pnpm exec convex codegen && pnpm exec vitest run convex/lib/__tests__/resend.test.ts && pnpm typecheck`. Expected: PASS. `git grep -n "from 'resend'"` returns nothing.

**Step 6: Checkpoint.** `feat(email): register the Convex Resend component`.

### Task 4: Campaign content, limits and admin CRUD

**Files:**

- Modify: `convex/lib/email_campaigns.ts`, `convex/emailCampaigns.ts`, `convex/emailDigest.ts`
- Test: `convex/lib/__tests__/email_campaigns.test.ts` (create), `convex/emailCampaigns.test.ts`, `convex/emailDigest.test.ts`

**Step 1: Write failing tests** for `convex/lib/email_campaigns.ts`:

```ts
describe('campaign content limits', () => {
  const base = { kind: 'announcement' as const, body: 'Hello', cta: null }

  it('accepts a minimal announcement', () => {
    expect(() =>
      assertCampaignDraft({ subject: 'News', preheader: '', content: base }),
    ).not.toThrow()
  })

  it.each([
    [
      { subject: 'x'.repeat(141), preheader: '', content: base },
      'Subject is too long',
    ],
    [
      { subject: 'News', preheader: 'x'.repeat(201), content: base },
      'Preheader is too long',
    ],
    [
      {
        subject: 'News',
        preheader: '',
        content: { ...base, body: 'x'.repeat(20_001) },
      },
      'Body is too long',
    ],
    [
      {
        subject: 'News',
        preheader: '',
        content: { ...base, cta: { label: 'Go', url: 'http://x.dev' } },
      },
      'Links must use HTTPS',
    ],
    [
      {
        subject: 'News',
        preheader: '',
        content: {
          ...base,
          cta: { label: 'x'.repeat(41), url: 'https://x.dev' },
        },
      },
      'Button label is too long',
    ],
  ])('rejects %#', (draft, message) => {
    expect(() => assertCampaignDraft(draft)).toThrow(message)
  })

  it('requires subject and body before sending', () => {
    expect(() =>
      assertSendableCampaign({ subject: ' ', preheader: '', content: base }),
    ).toThrow('Subject is required')
  })

  it('rejects rendered HTML over the clipping budget', () => {
    expect(() => assertRenderedSize('x'.repeat(100_001))).toThrow(
      'Email is too large',
    )
  })
})
```

**Step 2: Run.** `pnpm exec vitest run convex/lib/__tests__/email_campaigns.test.ts`. Expected: FAIL (functions missing).

**Step 3: Implement** in `convex/lib/email_campaigns.ts` (replace the old bounds functions, keep `assertSafeEmailUrl`, drop the FNV fingerprint):

```ts
export const EMAIL_TEMPLATE_VERSION = 2
export const LIMITS = {
  subject: 140,
  preheader: 200,
  body: 20_000,
  ctaLabel: 40,
  url: 2_000,
  renderedHtmlBytes: 100_000,
  projects: 5,
  discussions: 2,
} as const

type Draft = Pick<Doc<'email_campaigns'>, 'subject' | 'preheader' | 'content'>

function tooLong(value: string, label: string, max: number) {
  if (value.length > max) throw new ConvexError(`${label} is too long`)
}

export function assertSafeEmailUrl(value: string) {
  tooLong(value, 'Link', LIMITS.url)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConvexError('Links must be valid URLs')
  }
  if (url.protocol !== 'https:') throw new ConvexError('Links must use HTTPS')
}

export function assertCampaignDraft(draft: Draft) {
  tooLong(draft.subject, 'Subject', LIMITS.subject)
  tooLong(draft.preheader, 'Preheader', LIMITS.preheader)
  tooLong(draft.content.body, 'Body', LIMITS.body)
  if (draft.content.cta) {
    tooLong(draft.content.cta.label, 'Button label', LIMITS.ctaLabel)
    assertSafeEmailUrl(draft.content.cta.url)
  }
  if (draft.content.kind === 'digest') {
    if (draft.content.projects.length > LIMITS.projects)
      throw new ConvexError(`Select at most ${LIMITS.projects} projects`)
    if (draft.content.discussions.length > LIMITS.discussions)
      throw new ConvexError(`Select at most ${LIMITS.discussions} discussions`)
    for (const p of draft.content.projects) assertSafeEmailUrl(p.url)
    for (const d of draft.content.discussions) assertSafeEmailUrl(d.url)
  }
}

export function assertSendableCampaign(draft: Draft) {
  assertCampaignDraft(draft)
  if (!draft.subject.trim()) throw new ConvexError('Subject is required')
  if (!draft.content.body.trim()) throw new ConvexError('Body is required')
  if (draft.content.cta && !draft.content.cta.label.trim())
    throw new ConvexError('Button label is required')
}

export function assertRenderedSize(html: string) {
  if (new TextEncoder().encode(html).length > LIMITS.renderedHtmlBytes) {
    throw new ConvexError('Email is too large; shorten the body')
  }
}
```

Move the digest privacy check from the old `getSourceFingerprint` into `convex/lib/email_campaigns.ts` as `assertDigestSelectionsPublic(ctx, content)`: for a digest, every selected project must exist, be `exploreOwner.isEligible` and pass `isProjectPubliclyInteractable`; every comment must pass `isCommentPubliclyInteractable`; otherwise throw `Selected project <name> is no longer public` / `Selected discussion <title> is no longer public`. Announcements return immediately.

In `convex/emailCampaigns.ts` rewrite `createDraft({ kind, title })` (announcement content `{ kind, body: '', cta: null }`; digest content requires a period so admins create digests with `periodKey: 'manual:<now ISO>'`, `periodStart = periodEnd = now`, empty selections), `saveDraft({ campaignId, expectedRevision, title, subject, preheader, content })` (admin; `state === 'draft'` else `Campaign can only be edited as a draft`; revision check; `content.kind` must equal the stored kind; `assertCampaignDraft`), `list` (uses `by_updated_at`, `take(50)`), and `get` (adds `results` in Task 9). Keep `searchProjects` unchanged except importing the new `SITE_URL` helper (Task 7). In `convex/emailDigest.ts` write the new content shape: `subject`/`preheader` at top level, `body` from the old `introduction`, `cta: null`, `periodKey` etc. inside `content`; read the period index as `withIndex('by_content_kind_and_period_key', q => q.eq('content.kind', 'digest').eq('content.periodKey', period.key))`.

**Step 4: Update and run the campaign and digest tests.** Adapt `convex/emailCampaigns.test.ts` (authorization, stale revision, edit only in draft, kind cannot change, limits) and `convex/emailDigest.test.ts` (new shape; keep the period-boundary, idempotent cron and privacy tests). Run: `pnpm exec vitest run convex/lib/__tests__/email_campaigns.test.ts convex/emailCampaigns.test.ts convex/emailDigest.test.ts`. Expected: PASS.

**Step 5: Checkpoint.** `feat(email): announcement and digest content with limits`.

---

## Phase 3: Preferences and unsubscribe

### Task 5: Categories, eligibility and the single preference writer

**Files:**

- Create: `convex/lib/email_audience.ts`, `convex/lib/email_preferences.ts`
- Test: `convex/lib/__tests__/email_audience.test.ts`, `convex/lib/__tests__/email_preferences.test.ts`

**Step 1: Write failing tests.**

`email_audience.test.ts` (pure functions over `Doc<'users'>` built from `createDefaultViewerProfile`):

```ts
it.each([
  ['eligible for updates by default', {}, 'product_updates', null],
  [
    'legacy user without the key',
    { notificationPrefs: { productUpdates: undefined } },
    'product_updates',
    null,
  ],
  [
    'opted out of updates',
    { notificationPrefs: { productUpdates: false } },
    'product_updates',
    'unsubscribed',
  ],
  ['digest needs opt-in', {}, 'weekly_digest', 'unsubscribed'],
  [
    'digest opted in',
    { notificationPrefs: { weeklyDigest: true } },
    'weekly_digest',
    null,
  ],
  [
    'unverified email',
    { emailVerified: false },
    'product_updates',
    'unverified',
  ],
  ['unusable email', { email: 'x@y.invalid' }, 'product_updates', 'unverified'],
  ['deactivated', { deactivatedAt: 1 }, 'product_updates', 'inactive'],
  ['deleted', { deletedAt: 1 }, 'product_updates', 'inactive'],
])('%s', (_, overrides, category, reason) => {
  expect(
    getSkipReason(makeUser({ emailVerified: true, ...overrides }), category),
  ).toBe(reason)
})
```

`email_preferences.test.ts` (convex-test, `resendTest.register(t)`):

- unsubscribing patches only that key, logs one row with the source, and schedules `internal.emailSends.cancelWaitingSends` with `{ userId }`;
- setting the current value again changes nothing and logs nothing;
- subscribing logs and does not schedule cancellation;
- an unknown user returns `{ changed: false }`.

**Step 2: Run.** Expected: FAIL (modules missing).

**Step 3: Implement.**

`convex/lib/email_audience.ts`:

```ts
import type { Doc } from './types'
import { isUsableEmailAddress } from './email_address'

export type EmailCategory = 'product_updates' | 'weekly_digest'
export type SkipReason = 'inactive' | 'unverified' | 'unsubscribed'

export function categoryForKind(
  kind: 'announcement' | 'digest',
): EmailCategory {
  return kind === 'digest' ? 'weekly_digest' : 'product_updates'
}

export function isSubscribed(user: Doc<'users'>, category: EmailCategory) {
  return category === 'weekly_digest'
    ? user.notificationPrefs.weeklyDigest
    : (user.notificationPrefs.productUpdates ?? true)
}

export function getSkipReason(
  user: Doc<'users'>,
  category: EmailCategory,
): SkipReason | null {
  if (
    user.deletedAt !== null ||
    user.deactivatedAt !== null ||
    user.purgeAfter !== null
  ) {
    return 'inactive'
  }
  if (user.emailVerified !== true || !isUsableEmailAddress(user.email)) {
    return 'unverified'
  }
  if (!isSubscribed(user, category)) return 'unsubscribed'
  return null
}
```

`convex/lib/email_preferences.ts`:

```ts
import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { isSubscribed, type EmailCategory } from './email_audience'

type Source =
  | 'settings'
  | 'unsubscribe_link'
  | 'one_click'
  | 'complaint'
  | 'backfill'
  | 'signup_default'

// The only code that changes email preferences. Cancellation of waiting
// sends runs in its own transaction so it can never roll back an opt-out.
export async function setEmailPreference(
  ctx: MutationCtx,
  args: {
    userId: Id<'users'>
    category: EmailCategory
    subscribed: boolean
    source: Source
  },
) {
  const user = await ctx.db.get(args.userId)
  if (!user) return { changed: false }
  if (isSubscribed(user, args.category) === args.subscribed) {
    return { changed: false }
  }
  const now = Date.now()
  const key =
    args.category === 'weekly_digest' ? 'weeklyDigest' : 'productUpdates'
  await ctx.db.patch(user._id, {
    notificationPrefs: { ...user.notificationPrefs, [key]: args.subscribed },
    updatedAt: now,
  })
  await ctx.db.insert('email_preference_changes', {
    userId: user._id,
    category: args.category,
    subscribed: args.subscribed,
    source: args.source,
    changedAt: now,
  })
  if (!args.subscribed) {
    await ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, {
      userId: user._id,
    })
  }
  return { changed: true }
}
```

Note: the patch spreads the **current** stored `notificationPrefs` read in this transaction and changes one key; Convex's serializable transactions make this safe against concurrent writers.

(`cancelWaitingSends` is a stub in `convex/emailSends.ts` until Task 10: `internalMutation({ args: { userId: v.optional(v.id('users')), campaignId: v.optional(v.id('email_campaigns')) }, returns: v.null(), handler: async () => null })`.)

**Step 4: Run.** `pnpm exec vitest run convex/lib/__tests__/email_audience.test.ts convex/lib/__tests__/email_preferences.test.ts`. Expected: PASS.

**Step 5: Checkpoint.** `feat(email): eligibility rules and single preference writer`.

### Task 6: Settings writes one preference at a time

**Files:**

- Modify: `convex/users.ts` (`updateNotificationPrefs` → `updateNotificationPref`)
- Create: `convex/emailPreferences.ts` (public `updateEmailPreference`, query `myEmailStatus`)
- Test: `convex/users.test.ts`, `convex/emailPreferences.test.ts`

**Step 1: Write failing tests.**

- `users.updateNotificationPref({ key: 'dms', value: true })` changes only `dms`; a call built from a stale copy of other keys cannot change them (there are no other keys in the args).
- `updateNotificationPref` rejects `key: 'weeklyDigest'` and `'productUpdates'` with `Use updateEmailPreference for email`.
- `emailPreferences.updateEmailPreference({ category: 'product_updates', subscribed: false })` as the signed-in user writes through `setEmailPreference` with source `settings`.
- `myEmailStatus` returns `{ productUpdates, weeklyDigest, emailVerified, blocked: null | 'bounced' | 'complained' }`, where `blocked` comes from the user's most recent `email_sends` with status `bounced` or `complained` whose `createdAt` is after `emailChangedAt ?? 0`. Use `by_user_and_status` with `.order('desc').first()` for each of the two statuses.

**Step 2: Run.** Expected: FAIL.

**Step 3: Implement.** Replace `updateNotificationPrefs` with:

```ts
const inAppNotificationKey = v.union(
  v.literal('projectLikes'),
  v.literal('updateLikes'),
  v.literal('comments'),
  v.literal('commentReplies'),
  v.literal('newFollowers'),
  v.literal('dms'),
  v.literal('contributorRecognized'),
)

export const updateNotificationPref = mutation({
  args: { key: inAppNotificationKey, value: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getOrCreateViewer(ctx)
    if (!viewer) throw new ConvexError('Viewer not found')
    await ctx.db.patch(viewer._id, {
      notificationPrefs: {
        ...viewer.notificationPrefs,
        [args.key]: args.value,
      },
      updatedAt: Date.now(),
    })
    return null
  },
})
```

(The validator itself rejects the email keys; the error message in the test is `ArgumentValidationError`, so assert `rejects.toThrow()`.)

In `convex/emailPreferences.ts`:

```ts
export const updateEmailPreference = mutation({
  args: { category: emailCategoryValidator, subscribed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewerOrThrow(ctx)
    await setEmailPreference(ctx, {
      userId: viewer._id,
      ...args,
      source: 'settings',
    })
    return null
  },
})
```

plus `myEmailStatus` as specified above, authenticated with `getViewerOrThrow`.

Update `src/features/settings/mutations.ts` (`useUpdateNotificationPref`, `useUpdateEmailPreference`) and the settings call site in Task 17.

**Step 4: Run.** `pnpm exec vitest run convex/users.test.ts convex/emailPreferences.test.ts && pnpm typecheck`. Expected: PASS (settings UI compile errors are fixed in Task 17; if `pnpm typecheck` fails only in `src/routes/_app/settings.tsx`, do Task 17 Step 3's minimal call-site change now).

**Step 5: Checkpoint.** `feat(email): per-key notification and email preference writes`.

### Task 7: Unsubscribe tokens

**Files:**

- Create: `convex/lib/unsubscribe_token.ts`
- Test: `convex/lib/__tests__/unsubscribe_token.test.ts`

**Step 1: Write failing tests.**

```ts
afterEach(() => vi.unstubAllEnvs())

describe('unsubscribe tokens', () => {
  beforeEach(() => vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 'current-secret'))

  it('round-trips user and category', async () => {
    const token = await signUnsubscribeToken('k57abc', 'product_updates')
    await expect(verifyUnsubscribeToken(token)).resolves.toEqual({
      userId: 'k57abc',
      category: 'product_updates',
    })
  })

  it('rejects tampering and a swapped category', async () => {
    const token = await signUnsubscribeToken('k57abc', 'product_updates')
    const [user, , sig] = token.split('.')
    await expect(
      verifyUnsubscribeToken(`${user}.weekly_digest.${sig}`),
    ).resolves.toBeNull()
    await expect(
      verifyUnsubscribeToken(`${user}x.product_updates.${sig}`),
    ).resolves.toBeNull()
    await expect(verifyUnsubscribeToken('garbage')).resolves.toBeNull()
  })

  it('accepts the previous secret during rotation', async () => {
    const token = await signUnsubscribeToken('k57abc', 'weekly_digest')
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 'new-secret')
    await expect(verifyUnsubscribeToken(token)).resolves.toBeNull()
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET_PREVIOUS', 'current-secret')
    await expect(verifyUnsubscribeToken(token)).resolves.not.toBeNull()
  })

  it('throws when signing without a secret', async () => {
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', '')
    await expect(
      signUnsubscribeToken('k57abc', 'product_updates'),
    ).rejects.toThrow('EMAIL_UNSUBSCRIBE_SECRET is not configured')
  })
})
```

**Step 2: Run.** Expected: FAIL.

**Step 3: Implement** `convex/lib/unsubscribe_token.ts`:

```ts
import type { EmailCategory } from './email_audience'

const encoder = new TextEncoder()
const CATEGORIES: readonly EmailCategory[] = [
  'product_updates',
  'weekly_digest',
]

function toBase64Url(bytes: ArrayBuffer) {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

async function signature(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return toBase64Url(
    await crypto.subtle.sign('HMAC', key, encoder.encode(message)),
  )
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function signUnsubscribeToken(
  userId: string,
  category: EmailCategory,
) {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()
  if (!secret) throw new Error('EMAIL_UNSUBSCRIBE_SECRET is not configured')
  return `${userId}.${category}.${await signature(secret, `${userId}:${category}`)}`
}

export async function verifyUnsubscribeToken(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, category, sig] = parts as [string, string, string]
  if (!userId || !CATEGORIES.includes(category as EmailCategory)) return null
  const secrets = [
    process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim(),
    process.env.EMAIL_UNSUBSCRIBE_SECRET_PREVIOUS?.trim(),
  ].filter((value): value is string => Boolean(value))
  for (const secret of secrets) {
    if (
      constantTimeEqual(sig, await signature(secret, `${userId}:${category}`))
    ) {
      return { userId, category: category as EmailCategory }
    }
  }
  return null
}
```

**Step 4: Run.** `pnpm exec vitest run convex/lib/__tests__/unsubscribe_token.test.ts`. Expected: PASS.

**Step 5: Verify Web Crypto in the Convex runtime.** `convex-test` runs in Node, which always has `crypto.subtle`. On the development deployment, run a throwaway internal mutation from the dashboard that calls `signUnsubscribeToken` and `verifyUnsubscribeToken` (or call `enqueueBatch` in Task 9's smoke test). Expected: no `crypto.subtle` error. If HMAC signing is unavailable in mutations, sign tokens in the `requestSend` action instead and pass them into batches (record the change in the design doc).

**Step 6: Checkpoint.** `feat(email): signed unsubscribe tokens with rotation`.

### Task 8: Unsubscribe endpoints

**Files:**

- Modify: `convex/emailPreferences.ts` (`unsubscribeWithToken`, `stopAllWithToken` public mutations; `oneClickUnsubscribe` internal mutation)
- Modify: `convex/http.ts` (`POST` and `GET` on `/email/unsubscribe`)
- Test: `convex/emailPreferences.test.ts`, `convex/http.unsubscribe.test.ts` (create; or a `describe` in an existing http test if one exists)

**Step 1: Write failing tests** (convex-test, `resendTest.register(t)`, `vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', 's')`, `vi.stubEnv('SITE_URL', 'https://locatic.test')`):

- `t.fetch('/email/unsubscribe?t=<valid>', { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } })` → `200`, empty body; user's `productUpdates` is `false`; one log row with source `one_click`.
- Same with a `multipart/form-data` body (`const form = new FormData(); form.set('List-Unsubscribe', 'One-Click')`) → `200`.
- `POST` without the field → `400`; preference unchanged.
- `POST` with a tampered token → `400`; unchanged.
- A valid token for a deleted user id (`ctx.db.delete`) → `200`, nothing written.
- Repeating a valid `POST` → `200`, still one log row.
- `GET /email/unsubscribe?t=<valid>` → `303` with `Location: https://locatic.test/unsubscribe?t=<valid>`; unchanged.
- `unsubscribeWithToken({ token })` (no identity) → `{ status: 'unsubscribed', category: 'product_updates' }`, source `unsubscribe_link`.
- `stopAllWithToken({ token })` → both preferences false, two log rows with source `unsubscribe_link`.
- Invalid token → `{ status: 'invalid' }` (no throw, so the page can render a message).

**Step 2: Run.** Expected: FAIL.

**Step 3: Implement.**

In `convex/emailPreferences.ts`:

```ts
const tokenResult = v.union(
  v.object({
    status: v.literal('unsubscribed'),
    category: emailCategoryValidator,
  }),
  v.object({ status: v.literal('invalid') }),
)

async function userFromToken(ctx: MutationCtx, token: string) {
  const parsed = await verifyUnsubscribeToken(token)
  if (!parsed) return null
  const userId = ctx.db.normalizeId('users', parsed.userId)
  return userId ? { userId, category: parsed.category } : null
}

export const unsubscribeWithToken = mutation({
  args: { token: v.string() },
  returns: tokenResult,
  handler: async (ctx, args) => {
    const parsed = await userFromToken(ctx, args.token)
    if (!parsed) return { status: 'invalid' as const }
    await setEmailPreference(ctx, {
      ...parsed,
      subscribed: false,
      source: 'unsubscribe_link',
    })
    return { status: 'unsubscribed' as const, category: parsed.category }
  },
})

export const stopAllWithToken = mutation({
  args: { token: v.string() },
  returns: tokenResult,
  handler: async (ctx, args) => {
    const parsed = await userFromToken(ctx, args.token)
    if (!parsed) return { status: 'invalid' as const }
    for (const category of ['product_updates', 'weekly_digest'] as const) {
      await setEmailPreference(ctx, {
        userId: parsed.userId,
        category,
        subscribed: false,
        source: 'unsubscribe_link',
      })
    }
    return { status: 'unsubscribed' as const, category: parsed.category }
  },
})

export const oneClickUnsubscribe = internalMutation({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const parsed = await userFromToken(ctx, args.token)
    if (!parsed) return false
    await setEmailPreference(ctx, {
      ...parsed,
      subscribed: false,
      source: 'one_click',
    })
    return true
  },
})
```

(`setEmailPreference` returns `{ changed: false }` for a missing user, so a deleted user's valid token succeeds silently.)

In `convex/http.ts`:

```ts
async function hasOneClickField(request: Request) {
  try {
    const form = await request.formData() // handles urlencoded and multipart
    return form.get('List-Unsubscribe') === 'One-Click'
  } catch {
    return false
  }
}

http.route({
  path: '/email/unsubscribe',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).searchParams.get('t') ?? ''
    if (!token || !(await hasOneClickField(request))) {
      return new Response(null, { status: 400 })
    }
    const ok = await ctx.runMutation(
      internal.emailPreferences.oneClickUnsubscribe,
      { token },
    )
    return new Response(null, { status: ok ? 200 : 400 })
  }),
})

http.route({
  path: '/email/unsubscribe',
  method: 'GET',
  handler: httpAction(async (_ctx, request) => {
    const token = new URL(request.url).searchParams.get('t') ?? ''
    const site = process.env.SITE_URL?.replace(/\/+$/, '') ?? ''
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${site}/unsubscribe?t=${encodeURIComponent(token)}`,
      },
    })
  }),
})
```

**Step 4: Run.** `pnpm exec vitest run convex/emailPreferences.test.ts convex/http.unsubscribe.test.ts`. Expected: PASS. If `request.formData()` is unsupported for multipart in convex-test, parse `application/x-www-form-urlencoded` with `URLSearchParams(await request.text())` and multipart with a minimal boundary check, and keep both tests.

**Step 5: Checkpoint.** `feat(email): one-click and link unsubscribe endpoints`.

---

## Phase 4: Rendering, sending and status

### Task 9: Template, preview and send preview

**Files:**

- Modify: `convex/lib/emails/community_update.tsx` (Markdown body, CTA, footer)
- Modify: `convex/emailRender.ts` (`'use node'`; `previewCampaign` action)
- Modify: `convex/emailCampaigns.ts` (`getSendPreview` query, `get` adds `results`)
- Test: `convex/lib/emails/community_update.test.tsx`, `convex/emailCampaigns.test.ts`

**Step 1: Write failing template tests** (render with `@react-email/render`):

- Markdown `**bold**`, `[link](https://x.dev)`, `- item` render as `<strong>`, `<a href="https://x.dev"`, `<li>`.
- `[bad](http://x.dev)`, `[js](javascript:alert(1))` and raw `<script>`/`<img>` do not produce an `href` with that scheme or the raw tags.
- The CTA renders as a link with its label when present, and not at all when `cta: null`.
- Footer contains `{{UNSUBSCRIBE_URL}}`, a Settings link built from `siteUrl`, "You receive this because…" copy, and the postal address only when provided.
- Plain-text output contains the body text, the CTA as `Label: url`, and `Unsubscribe: {{UNSUBSCRIBE_URL}}`.
- Digest content still renders projects and discussions.

**Step 2: Run.** `pnpm exec vitest run convex/lib/emails/community_update.test.tsx`. Expected: FAIL.

**Step 3: Implement the template.**

- Rename the placeholder: `export const UNSUBSCRIBE_URL_PLACEHOLDER = '{{UNSUBSCRIBE_URL}}'`.
- Props: `{ subject, preheader, content, siteUrl, postalAddress, category }`.
- Body: `react-markdown` with `allowedElements={['p', 'strong', 'em', 'a', 'ul', 'ol', 'li']}`, `unwrapDisallowed`, `skipHtml`, `urlTransform={(url) => (url.startsWith('https://') ? url : '')}` and `components` mapping each element to inline-styled email-safe tags (reuse `copyStyle`, `linkStyle`; drop `whiteSpace: 'pre-wrap'` for Markdown paragraphs).
- CTA: a table-based button (`<table role="presentation"><tr><td style={{ backgroundColor: palette.accent, borderRadius: 8 }}><a …>`) for Outlook compatibility.
- Footer: "You're receiving Locatic updates because you have a Locatic account." (digest: "…because you turned on the weekly digest."), links "Unsubscribe" (`UNSUBSCRIBE_URL_PLACEHOLDER`) and "Email settings" (`${siteUrl}/settings`), then `postalAddress` when set.
- `renderCommunityUpdateText` mirrors the same sections; strip Markdown with `react-markdown`'s output or a small `toPlainText` (links become `text (url)`).

Run the tests again. Expected: PASS.

**Step 4: Write failing tests for preview and send preview** in `convex/emailCampaigns.test.ts`:

- `previewCampaign` (admin only) with unsaved content returns `{ requestId, html }` echoing the request id; content over limits throws the limit message; non-admin throws.
- `getSendPreview({ campaignId })` (admin only) for an announcement with users: two eligible (verified, default prefs), one opted out, one unverified, one deactivated → `{ estimatedCount: 2, sample: [{ displayName, githubUsername }…], skipped: { unsubscribed: 1, unverified: 1, inactive: 1 } }`; for a digest only `weeklyDigest` users count. It reads at most 1,000 users (`take(1001)`) and returns `capped: true` beyond that; the dialog then shows "1,000+".

**Step 5: Implement.** `previewCampaign` in `convex/emailRender.ts`:

```ts
export const previewCampaign = action({
  args: {
    requestId: v.number(),
    subject: v.string(),
    preheader: v.string(),
    content: emailCampaignContentValidator,
  },
  returns: v.object({ requestId: v.number(), html: v.string() }),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.emailCampaigns.assertAdmin, {})
    assertCampaignDraft(args)
    const config = getEmailConfig()
    const html = await renderCampaignHtml({
      ...args,
      siteUrl: config?.siteUrl ?? 'https://locatic.dev',
      postalAddress: config?.postalAddress ?? null,
    })
    assertRenderedSize(html)
    return { requestId: args.requestId, html }
  },
})
```

`assertAdmin` is an `internalQuery` that calls `requireEmailAdmin(ctx)` and returns `null` (actions inherit the caller's identity in `runQuery`). `renderCampaignHtml`/`renderCampaignText` live in `convex/lib/emails/render.ts` (Node-only import of `@react-email/render`; import it only from `'use node'` files).

`getSendPreview` in `convex/emailCampaigns.ts` iterates `ctx.db.query('users').take(1001)`, applies `getSkipReason`, and builds the counts; sample = first five eligible users' `profile.displayName` and `github.username` (check the exact field names in `Doc<'users'>`).

**Step 6: Run.** `pnpm exec vitest run convex/lib/emails/community_update.test.tsx convex/emailCampaigns.test.ts`. Expected: PASS.

**Step 7: Checkpoint.** `feat(email): Markdown template, live preview and send estimate`.

### Task 10: Start, enqueue, resume and cancel

**Files:**

- Modify: `convex/emailRender.ts` (`requestSend` action, `sendTest` action)
- Modify: `convex/emailCampaigns.ts` (`startSend` internal mutation, `resumeSend`, `cancelSend` public mutations, `get` results)
- Modify: `convex/emailSends.ts` (`enqueueBatch`, `cancelWaitingSends`)
- Modify: `convex/users.ts` (deactivation, deletion and email-change paths schedule `cancelWaitingSends`)
- Test: `convex/emailSends.test.ts` (create), `convex/emailCampaigns.test.ts`

**Step 1: Write failing tests** (`resendTest.register(t)`, `rateLimiterTest.register(t)`, env: admin allowlist, `EMAIL_SENDING_ENABLED=true`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `SITE_URL`, `EMAIL_UNSUBSCRIBE_SECRET`; drive the chain with `await t.finishAllScheduledFunctions(vi.runAllTimers)` under `vi.useFakeTimers()`):

1. **Happy path:** 3 eligible users, 1 opted out. `requestSend({ campaignId, expectedRevision })` → campaign `sent`, `sent.enqueuedAt` set, 3 `email_sends` rows `queued`, each with a distinct `emailId`; the component's stored email for one user has `List-Unsubscribe` and `List-Unsubscribe-Post` headers and an unsubscribe URL containing that user's token (read via `resend.get(ctx, emailId)` inside `t.run`).
2. **Pagination:** with 0, 99, 100, 101 and 201 eligible users, exactly that many rows; the chain ends on `isDone`. Use a test-only batch size: `enqueueBatch` takes `pageSize` (default 100) so the test can also run 201 users at `pageSize: 7`.
3. **No duplicates:** calling `requestSend` twice → second throws `Campaign is not a draft`; running `enqueueBatch` twice for the same cursor (simulate Resume) → still one row per user; a component idempotency key `campaign:<id>:user:<id>` is set (assert via `resend.get`).
4. **Stale revision:** save after the action's render (call `startSend` directly with `expectedRevision` one lower) → throws `Campaign changed. Preview the latest version and send again.`; state stays `draft`.
5. **Digest privacy:** a digest whose selected project became private → `startSend` throws `Selected project … is no longer public`.
6. **Sending disabled:** `EMAIL_SENDING_ENABLED` unset → `requestSend` throws `Email sending is disabled in this environment`.
7. **Opt-out mid-send:** with `pageSize: 1` and 3 users, after the first batch run `setEmailPreference(user3, unsubscribe)`; finish the chain → user3 has no row.
8. **Cancel:** with `pageSize: 1`, cancel after the first batch → state `cancelled`, no further rows; `cancelWaitingSends({ campaignId })` marks the waiting row `cancelled` and calls the component cancel (component status `cancelled`).
9. **Cancel never throws for sent email:** patch the component email to `sent` (inside `t.run` on the component tables, or by running the component's batch worker), then `cancelWaitingSends({ userId })` → row stays `queued`, no throw.
10. **Resume:** set the campaign `sending` with `lastBatchAt` 6 minutes ago and no scheduled batch → `resumeSend` schedules `enqueueBatch` from `sent.cursor`; with `lastBatchAt` 1 minute ago → throws `Sending is still in progress`.
11. **Opt-out commits even when cancellation is impossible:** covered by Task 5 (cancellation is scheduled, never inline).

**Step 2: Run.** `pnpm exec vitest run convex/emailSends.test.ts convex/emailCampaigns.test.ts`. Expected: FAIL.

**Step 3: Implement.**

`requestSend` (`convex/emailRender.ts`, `'use node'`):

```ts
export const requestSend = action({
  args: { campaignId: v.id('email_campaigns'), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const campaign = await ctx.runQuery(
      internal.emailCampaigns.getForSend,
      args,
    )
    const config = getEmailConfig()
    if (!config)
      throw new ConvexError('Email sender configuration is incomplete')
    const html = await renderCampaignHtml({
      ...campaign,
      siteUrl: config.siteUrl,
      postalAddress: config.postalAddress,
    })
    assertRenderedSize(html)
    const text = renderCampaignText({
      ...campaign,
      siteUrl: config.siteUrl,
      postalAddress: config.postalAddress,
    })
    await ctx.runMutation(internal.emailCampaigns.startSend, {
      ...args,
      html,
      text,
    })
    return null
  },
})
```

`getForSend` (internalQuery): `requireEmailAdmin`, load the campaign, return `{ subject, preheader, content, category }` only if `state === 'draft'` and the revision matches (else throw the same messages as `startSend`).

`startSend` (internalMutation) re-checks everything inside its transaction:

```ts
export const startSend = internalMutation({
  args: {
    campaignId: v.id('email_campaigns'),
    expectedRevision: v.number(),
    html: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireEmailAdmin(ctx)
    if (!isCampaignSendingEnabled()) {
      throw new ConvexError('Email sending is disabled in this environment')
    }
    if (!getEmailConfig() || !process.env.EMAIL_UNSUBSCRIBE_SECRET) {
      throw new ConvexError('Email configuration is incomplete')
    }
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign) throw new ConvexError('Campaign not found')
    if (campaign.state !== 'draft')
      throw new ConvexError('Campaign is not a draft')
    if (campaign.revision !== args.expectedRevision) {
      throw new ConvexError(
        'Campaign changed. Preview the latest version and send again.',
      )
    }
    assertSendableCampaign(campaign)
    assertRenderedSize(args.html)
    await assertDigestSelectionsPublic(ctx, campaign.content)
    const now = Date.now()
    await ctx.db.patch(campaign._id, {
      state: 'sending',
      sent: {
        revision: campaign.revision,
        html: args.html,
        text: args.text,
        startedAt: now,
        startedBy: admin._id,
        cursor: null,
        lastBatchAt: now,
      },
      updatedBy: admin._id,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.emailSends.enqueueBatch, {
      campaignId: campaign._id,
    })
    return null
  },
})
```

`enqueueBatch` (`convex/emailSends.ts`):

```ts
export const enqueueBatch = internalMutation({
  args: {
    campaignId: v.id('email_campaigns'),
    pageSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const campaign = await ctx.db.get(args.campaignId)
    if (!campaign || campaign.state !== 'sending' || !campaign.sent) return null
    const config = getEmailConfig()
    if (!config) throw new Error('Email configuration is incomplete')
    const category = categoryForKind(campaign.content.kind)
    const resend = getResend()
    const page = await ctx.db
      .query('users')
      .order('asc')
      .paginate({
        numItems: args.pageSize ?? 100,
        cursor: campaign.sent.cursor,
      })
    const now = Date.now()

    for (const user of page.page) {
      if (getSkipReason(user, category)) continue
      const existing = await ctx.db
        .query('email_sends')
        .withIndex('by_campaign_and_user', (q) =>
          q.eq('campaignId', campaign._id).eq('userId', user._id),
        )
        .unique()
      if (existing) continue

      const token = await signUnsubscribeToken(user._id, category)
      const oneClickUrl = `${process.env.CONVEX_SITE_URL}/email/unsubscribe?t=${encodeURIComponent(token)}`
      const pageUrl = `${config.siteUrl}/unsubscribe?t=${encodeURIComponent(token)}`
      const emailId = await resend.sendEmail(ctx, {
        from: config.from,
        replyTo: [config.replyTo],
        to: user.email,
        subject: campaign.subject,
        html: campaign.sent.html.replaceAll(
          UNSUBSCRIBE_URL_PLACEHOLDER,
          pageUrl,
        ),
        text: campaign.sent.text.replaceAll(
          UNSUBSCRIBE_URL_PLACEHOLDER,
          pageUrl,
        ),
        headers: [
          { name: 'List-Unsubscribe', value: `<${oneClickUrl}>` },
          {
            name: 'List-Unsubscribe-Post',
            value: 'List-Unsubscribe=One-Click',
          },
        ],
        idempotencyKey: `campaign:${campaign._id}:user:${user._id}`,
      })
      await ctx.db.insert('email_sends', {
        campaignId: campaign._id,
        userId: user._id,
        emailId,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
      })
    }

    if (page.isDone) {
      await ctx.db.patch(campaign._id, {
        state: 'sent',
        sent: {
          ...campaign.sent,
          cursor: page.continueCursor,
          lastBatchAt: now,
          enqueuedAt: now,
        },
        updatedAt: now,
      })
      return null
    }
    await ctx.db.patch(campaign._id, {
      sent: { ...campaign.sent, cursor: page.continueCursor, lastBatchAt: now },
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.emailSends.enqueueBatch, {
      campaignId: campaign._id,
      pageSize: args.pageSize,
    })
    return null
  },
})
```

Notes for the implementer: `CONVEX_SITE_URL` is a built-in Convex environment variable (the `.convex.site` origin); in tests stub it. The `.unique()` lookup plus insert in the same mutation is the dedup guarantee (Convex mutations are serializable). `escape` nothing into HTML here: the token is base64url plus a Convex id and is safe in an `href`.

`cancelWaitingSends`:

```ts
export const cancelWaitingSends = internalMutation({
  args: {
    userId: v.optional(v.id('users')),
    campaignId: v.optional(v.id('email_campaigns')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = args.userId
      ? await ctx.db
          .query('email_sends')
          .withIndex('by_user_and_status', (q) =>
            q.eq('userId', args.userId!).eq('status', 'queued'),
          )
          .take(100)
      : args.campaignId
        ? await ctx.db
            .query('email_sends')
            .withIndex('by_campaign_and_status', (q) =>
              q.eq('campaignId', args.campaignId!).eq('status', 'queued'),
            )
            .take(100)
        : []
    const resend = getResend()
    let cancelled = 0
    for (const row of rows) {
      const status = await resend.status(ctx, row.emailId as EmailId)
      if (status?.status !== 'waiting') continue
      await resend.cancelEmail(ctx, row.emailId as EmailId)
      await ctx.db.patch(row._id, {
        status: 'cancelled',
        updatedAt: Date.now(),
      })
      cancelled += 1
    }
    if (rows.length === 100 && cancelled > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.emailSends.cancelWaitingSends,
        args,
      )
    }
    return null
  },
})
```

`cancelSend` (public, admin): if `state === 'sending'` set `cancelled`; if `state` is `sending` or `sent`, schedule `cancelWaitingSends({ campaignId })`; otherwise throw `Only a campaign that is sending can be cancelled`. `resumeSend` (public, admin): only when `state === 'sending'` and `sent.lastBatchAt < Date.now() - 5 * 60_000`; schedules `enqueueBatch`.

In `convex/users.ts`, after `deactivateAccount`, `requestAccountDeletion` and an email change in `upsertFromClerkWebhook`, add `await ctx.scheduler.runAfter(0, internal.emailSends.cancelWaitingSends, { userId })`. In `scrubDeletedAccount` (purge), delete the user's `email_sends` and `email_preference_changes` rows with bounded `take(500)` loops that reschedule like the existing purge batches do.

`get` adds `results: { queued, sent, delivered, bounced, complained, failed, cancelled }` counted with `by_campaign_and_status` (`take(5001)` per status; return `5000+` cap flag) and a `recipients` page query (`listRecipients({ campaignId, paginationOpts })`) joining `users` for display name and handle.

**Step 4: Run.** `pnpm exec vitest run convex/emailSends.test.ts convex/emailCampaigns.test.ts convex/users.test.ts`. Expected: PASS.

**Step 5: Checkpoint.** `feat(email): durable per-recipient sending with resume and cancel`.

### Task 11: Delivery events, reconciliation and retention

**Files:**

- Modify: `convex/emailSends.ts` (`handleEmailEvent`, `reconcileSends`, `cleanupComponentEmails`), `convex/http.ts` (component webhook route), `convex/crons.ts`
- Test: `convex/emailSends.test.ts`, `convex/lib/__tests__/email_send_status.test.ts`

**Step 1: Write failing tests.**

`email_send_status.test.ts` for `nextSendStatus(current, incoming)`:

```ts
it.each([
  ['queued', 'sent', 'sent'],
  ['sent', 'delivered', 'delivered'],
  ['delivered', 'sent', null],
  ['complained', 'delivered', null],
  ['bounced', 'complained', null],
  ['queued', 'failed', 'failed'],
  ['cancelled', 'sent', null],
  ['delivered', 'complained', 'complained'],
])('%s + %s -> %s', (current, incoming, expected) => {
  expect(nextSendStatus(current, incoming)).toBe(expected)
})
```

`emailSends.test.ts`:

- `handleEmailEvent` with `email.delivered` for a queued row → `delivered`; a later `email.sent` leaves it `delivered`.
- `email.complained` → row `complained`; both preferences false with source `complaint`; `cancelWaitingSends` scheduled. Repeating the same complaint event → no second log rows.
- `email.opened`, `email.clicked`, `email.delivery_delayed` → no change.
- Unknown `emailId` (test sends have no row) → no-op.
- `reconcileSends`: a row `queued` with `updatedAt` 20 minutes old whose component email is `failed` (set via component tables) → row `failed` with `errorMessage`; a row 5 minutes old is untouched; processes at most 100.

**Step 2: Run.** Expected: FAIL.

**Step 3: Implement.**

`convex/lib/email_send_status.ts`:

```ts
export type SendStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'cancelled'

const RANK: Partial<Record<SendStatus, number>> = {
  queued: 0,
  sent: 1,
  delivered: 2,
}
const TERMINAL = new Set<SendStatus>([
  'bounced',
  'complained',
  'failed',
  'cancelled',
])

export function nextSendStatus(
  current: SendStatus,
  incoming: SendStatus,
): SendStatus | null {
  if (TERMINAL.has(current)) return null
  if (TERMINAL.has(incoming)) return incoming
  return (RANK[incoming] ?? -1) > (RANK[current] ?? -1) ? incoming : null
}

export function statusFromEvent(type: string): SendStatus | null {
  switch (type) {
    case 'email.sent':
      return 'sent'
    case 'email.delivered':
      return 'delivered'
    case 'email.bounced':
      return 'bounced'
    case 'email.complained':
      return 'complained'
    case 'email.failed':
      return 'failed'
    default:
      return null
  }
}
```

`handleEmailEvent` (`internalMutation`, args `vOnEmailEventArgs`): find the row by `by_email_id`; compute `nextSendStatus`; patch; if the new status is `complained`, call `setEmailPreference` for both categories with source `complaint` (which schedules cancellation). The terminal rule makes repeated complaint events no-ops.

`reconcileSends` (`internalMutation`): for `status` in `queued` then `sent`, read `by_status_and_updated_at` with `lt('updatedAt', Date.now() - 15 * 60_000)`, `take(100)` total; for each row read `resend.status`; map component `failed`/`cancelled`/`bounced`/`delivered` (and `complained: true` → `complained`) through `nextSendStatus`; if unchanged, still bump `updatedAt` so the next run moves on; if the component record is missing (already cleaned up), mark `failed` with `errorMessage: 'No delivery record'`.

`cleanupComponentEmails` (`internalMutation`): schedule `components.resend.lib.cleanupOldEmails` with `olderThan: 30 days` and `cleanupAbandonedEmails` with `olderThan: 60 days`.

`convex/http.ts`:

```ts
http.route({
  path: '/resend-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) =>
    getResend().handleResendEventWebhook(ctx, request),
  ),
})
```

`convex/crons.ts`: add `reconcile email sends` (every 15 minutes, `internal.emailSends.reconcileSends`), `clean up delivered email copies` (hourly, `internal.emailSends.cleanupComponentEmails`), and restore `prepare due community email draft daily` (`internal.emailDigest.prepareDue`, still disabled by config).

**Step 4: Run.** `pnpm exec vitest run convex/lib/__tests__/email_send_status.test.ts convex/emailSends.test.ts`. Expected: PASS.

**Step 5: Checkpoint.** `feat(email): delivery status, reconciliation and retention`.

### Task 12: Test sends

**Files:**

- Modify: `convex/emailRender.ts` (`sendTest`)
- Test: `convex/emailCampaigns.test.ts` (or `convex/emailRender.test.ts`)

**Step 1: Write failing tests.** `sendTest({ subject, preheader, content, recipient })`: admin only; `EMAIL_TEST_SENDING_ENABLED` must be `'true'`; recipient must be in `EMAIL_TEST_RECIPIENTS` (case-insensitive); subject gets `[test] `; unsubscribe placeholder is replaced with `${siteUrl}/settings`; the sixth call within an hour fails with the existing rate-limit error; no `email_sends` row is written.

**Step 2: Run.** Expected: FAIL.

**Step 3: Implement.** The action renders like `previewCampaign`, checks the allowlist and `enforceRateLimit(ctx, 'emailTestSend', adminId)`, then calls an internal mutation `enqueueTestEmail({ to, subject, html, text })` that calls `getResend().sendEmail(...)` (component sends must run in a mutation or action context; keep the Node-only render in the action).

**Step 4: Run.** Expected: PASS.

**Step 5: Checkpoint.** `feat(email): allowlisted test sends through the component`.

### Task 13: Backfills

**Files:**

- Create: `convex/emailMigrations.ts`
- Test: `convex/emailMigrations.test.ts`

**Step 1: Write failing tests.**

- `backfillProductUpdates({ cursor: null })` over 3 users (one already `false`, two missing the key) → the two get `true` with a `backfill` log row each; the `false` one is untouched; re-running changes nothing.
- `applyEmailVerified({ updates: [{ userId, email, verified }] })` writes `emailVerified` only when `normalizeEmailAddress(user.email) === normalizeEmailAddress(email)`; a mismatched email is skipped and reported in the return value.
- `backfillEmailVerified` (action) with a mocked Clerk client (inject via a small `listClerkUsersByIds` module function that tests replace with `vi.mock`) pages Convex users 100 at a time, requests Clerk users by those IDs, skips missing users, and on a `429` error reschedules itself after `retryAfter` seconds.

**Step 2: Run.** Expected: FAIL.

**Step 3: Implement.** `backfillProductUpdates` is an `internalMutation` paging `users` with `paginate({ numItems: 100, cursor })` and rescheduling until `isDone`, writing through a direct patch plus a `backfill` log row (not `setEmailPreference`, which would skip because `?? true` already reads as subscribed). `backfillEmailVerified` is an `internalAction` using `createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })` from `@clerk/backend`, `users.getUserList({ userId: clerkIds, limit: 100 })`; read the primary email address and its `verification.status === 'verified'`; pass results to `applyEmailVerified`.

**Step 4: Run.** Expected: PASS.

**Step 5: Run the backfills on development** from the dashboard: `emailMigrations.backfillProductUpdates({ cursor: null })`, then `emailMigrations.backfillEmailVerified({ cursor: null })`. Expected: every user has `notificationPrefs.productUpdates` and `emailVerified` set (spot-check in the dashboard data view).

**Step 6: Tighten the schema.** Make `emailVerified` and `notificationPrefs.productUpdates` required in `convex/schema.ts`, the viewer return validator and `createDefaultViewerProfile` (already sets them). Simplify `isSubscribed` to read `productUpdates` directly. Run `pnpm exec convex codegen && pnpm typecheck && pnpm exec vitest run convex`. Expected: PASS. Production follows the same order at deploy time (rollout section).

**Step 7: Checkpoint.** `feat(email): backfill email preferences and verification`.

---

## Phase 5: Frontend

Frontend tests use `// @vitest-environment jsdom` as the first line, render with `@testing-library/react` and `@testing-library/user-event`, and mock `convex/react` with `vi.mock` (see `src/features/inbox/__tests__/inbox-route.test.tsx`). There is no shared render helper.

### Task 14: Admin flag, guard and links

**Files:**

- Modify: `convex/users.ts` (`viewerBootstrapValidator` near line 206 and `viewerBootstrap` near line 1341: add `isEmailAdmin: boolean`)
- Modify: `convex/lib/email_admin.ts` (export `isEmailAdminViewer(identitySubject, viewer)` used by both `requireEmailAdmin` and `viewerBootstrap`)
- Modify: `src/features/contracts.ts:113` (`ViewerBootstrapPayload.isEmailAdmin`) and `mapViewerBootstrap` (line 288)
- Modify: `src/routes/_app/admin/emails.tsx` (guard), `src/components/app-shell/member-shell.tsx`, `src/components/app-shell/app-layout.tsx`, `src/components/app-shell/sidebar-nav.tsx` (`AccountMenu`)
- Test: `convex/users.test.ts`, `src/routes/__tests__/admin-emails-guard.test.ts` (create), `src/components/app-shell/__tests__/sidebar-nav.test.tsx` (create or extend)

**Why the bootstrap:** `_app`'s `beforeLoad` already loads `viewerBootstrap` after the root route sets the Convex token, on both SSR and client navigation, and uses it for the onboarding redirect. Reusing it gives the admin guard the same, already-working auth timing.

**Step 1: Write failing tests.**

- `viewerBootstrap` returns `isEmailAdmin: true` for an allowlisted, active viewer; `false` for others, for unauthenticated and for missing viewers.
- The admin route's `beforeLoad` throws a redirect to `/home` when the cached bootstrap has `isEmailAdmin: false`, and resolves when `true`. Test by calling `Route.options.beforeLoad` with a stub `context.queryClient.ensureQueryData` (follow `src/routes/__tests__/private-loader-gating.test.ts`).
- `AccountMenu` shows an "email campaigns" item linking to `/admin/emails` only when `isEmailAdmin` is true.

**Step 2: Run.** `pnpm exec vitest run convex/users.test.ts src/routes/__tests__/admin-emails-guard.test.ts src/components/app-shell/__tests__/sidebar-nav.test.tsx`. Expected: FAIL.

**Step 3: Implement.**

```ts
// src/routes/_app/admin/emails.tsx
export const Route = createFileRoute('/_app/admin/emails')({
  beforeLoad: async ({ context }) => {
    const bootstrap = (await context.queryClient.ensureQueryData(
      viewerQueryOptions(),
    )) as ViewerBootstrapPayload
    if (!bootstrap.isEmailAdmin) throw redirect({ to: '/home' })
  },
  loader: async ({ context }) => {
    if (!shouldPrefetchPrivateConvexQueries()) return
    await context.queryClient.ensureQueryData(emailCampaignListQueryOptions())
  },
  pendingComponent: FormRoutePending,
  pendingMs: ROUTE_PENDING_MS,
  pendingMinMs: ROUTE_PENDING_MIN_MS,
  component: CampaignWorkspace,
})
```

Thread `isEmailAdmin` from `MemberShell` through `AppLayout` to `SidebarNav` and `AccountMenu`, adding a `DropdownMenuItem asChild` with `<Link to="/admin/emails" preload={false} className="text-inherit no-underline">email campaigns</Link>` after "settings" when true. Mobile users reach it from the settings page (Task 17).

**Step 4: Run.** Expected: PASS. Run `pnpm typecheck`.

**Step 5: Checkpoint.** `feat(email): expose admin access in navigation`.

### Task 15: Rebuild the admin workspace

**Files (all under `src/features/email-campaigns/`):**

- Create: `queries.ts` (`emailCampaignListQueryOptions`, `emailCampaignQueryOptions(id)`, `emailSendPreviewQueryOptions(id)`, `emailCampaignRecipientsQueryOptions(id)`; move the first two out of `src/integrations/convex/query-options.ts` only if other modules do not import them there)
- Create: `mutations.ts` (`useCreateEmailCampaign`, `useSaveEmailCampaign`, `useRequestEmailSend`, `useSendEmailTest`, `usePreviewEmailCampaign`, `useCancelEmailSend`, `useResumeEmailSend`, using `useMutation`/`useAction` from `convex/react` with generated `api`)
- Create: `contracts.ts` (types inferred from `FunctionReturnType<typeof api.emailCampaigns.get>` etc.; status labels)
- Create: `use-campaign-preview.ts` (debounced preview hook)
- Create: `components/campaign-workspace.tsx`, `components/campaign-list.tsx`, `components/campaign-editor.tsx`, `components/preview-pane.tsx`, `components/send-dialog.tsx`, `components/campaign-results.tsx`
- Test: `__tests__/use-campaign-preview.test.tsx`, `__tests__/campaign-editor.test.tsx`, `__tests__/send-dialog.test.tsx`, `__tests__/campaign-results.test.tsx`, `__tests__/campaign-workspace.test.tsx`

**Behaviour to test first (Step 1), then implement (Step 3):**

1. `use-campaign-preview`: with fake timers, typing three times within 500 ms triggers one preview call; when an older response resolves after a newer one, the hook keeps the newer HTML (compare the echoed `requestId` with a ref holding the latest).
2. `campaign-editor`: fields for title, subject, preheader, body (Markdown hint: "**bold**, [links](https://…), and - lists"), optional button (label and URL); character counters at the limits from `convex/lib/email_campaigns.ts` (import `LIMITS` through a shared re-export or duplicate the numbers in `contracts.ts` with a test asserting they match); Save is disabled until something changes; a stale-revision error shows "Someone else changed this draft. Reload to see their version." Digest drafts also show project and discussion pickers (reuse the existing project search query).
3. `campaign-workspace`: Write / Test / Send tabs (`Tabs` from `@/components/ui/tabs`); non-draft campaigns open on a read-only results view; `beforeunload` guard via `useUnsavedChangesGuard` while dirty.
4. Test tab: recipient input prefilled with the admin's email when it is in the allowlist (expose `testRecipients` from `get` for admins only); success and failure use `toast` from `sonner`.
5. `send-dialog` (`Dialog` from `@/components/ui/dialog`): shows "Send "<subject>" to about N people?", up to five `PersonRow`s, skipped counts in words ("2 turned updates off · 1 unverified email"), "about" wording and `1,000+` when capped; the confirm button reads "Send to N people" and is disabled while the draft is dirty or the preview query is loading; Escape and Cancel close it; focus returns to the Send button.
6. `campaign-results`: counts by status; a paginated recipient table (name, handle, status, time); **Cancel** while any send is `queued` (with a confirm explaining emails already handed over cannot be recalled); **Resume** when `state === 'sending'` and `sent.lastBatchAt` is older than five minutes.
7. `campaign-list`: title, kind, `StatusPill` (pass the campaign state text), "sent to N · M delivered" for sent campaigns; "New update" and "New digest" buttons.

Copy is plain language throughout: no "provider", "handoff", "artifact", "revision" (use "version"), "sync".

**Step 2: Run** `pnpm exec vitest run src/features/email-campaigns`. Expected: FAIL. **Step 4:** Expected: PASS; then `pnpm typecheck && pnpm check`.

**Step 5: Checkpoint.** `feat(email): rebuild the campaign workspace`.

### Task 16: Public unsubscribe page

**Files:**

- Create: `src/routes/unsubscribe.tsx` (public, outside `_app`; copy the shape of `src/routes/privacy.tsx`)
- Create: `src/features/email-preferences/unsubscribe-page.tsx`, `src/features/email-preferences/mutations.ts`
- Test: `src/features/email-preferences/__tests__/unsubscribe-page.test.tsx`

**Step 1: Write failing tests.**

- Rendering with a token calls no mutation (link scanners must not unsubscribe anyone).
- Clicking "Unsubscribe" calls `unsubscribeWithToken({ token })` once and shows "You're unsubscribed from Locatic updates." (or "…from the weekly digest.") with a "Stop all Locatic email" button and a "Manage email in settings" link to `/settings?tab=notifications`.
- "Stop all Locatic email" calls `stopAllWithToken` and shows "You won't get any more Locatic email."
- `{ status: 'invalid' }` shows "This link doesn't work. Manage email from Settings after signing in." and no buttons.
- A thrown error shows a retry message; the button re-enables.
- No Undo control exists.

**Step 2: Run.** Expected: FAIL.

**Step 3: Implement.** Route:

```ts
export const Route = createFileRoute('/unsubscribe')({
  validateSearch: (search: Record<string, unknown>) => ({
    t: typeof search.t === 'string' ? search.t : '',
  }),
  head: () => ({
    meta: [
      { title: 'Unsubscribe · Locatic' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: UnsubscribeRoute,
})
```

The page uses `PublicHeader`/`PublicFooter`, a single centred card, `Button` variants only, `role="status"` for the result and `role="alert"` for errors.

**Step 4: Run.** Expected: PASS.

**Step 5: Checkpoint.** `feat(email): public unsubscribe page`.

### Task 17: Settings

**Files:**

- Modify: `src/routes/_app/settings.tsx` (notifications tab), `src/features/settings/mutations.ts`, `src/features/settings/queries.ts`
- Create: `src/features/settings/email-preferences-section.tsx`
- Test: `src/features/settings/__tests__/email-preferences-section.test.tsx`, existing settings tests

**Step 1: Write failing tests** for the presentational `EmailPreferencesSection` (props: `status`, `onChange(category, subscribed)`, `isEmailAdmin`):

- Two switches: "Locatic updates" (on by default) with "Product news and announcements, a couple of times a month at most.", and "Weekly digest email" with "Not sending yet; we'll email you when it starts."
- Toggling calls `onChange('product_updates', false)`.
- `emailVerified: false` shows "Verify your email in your account settings to receive email from Locatic."
- `blocked: 'complained'` or `'bounced'` shows "Our email provider stopped delivering to this address after a spam report or bounce. Turning this on won't change that; contact us to fix it."
- `isEmailAdmin` shows an "Email campaigns" link to `/admin/emails`.

**Step 2: Run.** Expected: FAIL.

**Step 3: Implement.** Remove `weeklyDigest` from the in-app list in `settings.tsx`; each remaining switch calls `updateNotificationPref({ key, value })` (one key per call, no stale object). Render `EmailPreferencesSection` below the in-app list, fed by `myEmailStatusQueryOptions()` (`convexQuery(api.emailPreferences.myEmailStatus, {})`) and `useUpdateEmailPreference()`; errors go through the existing `reportActionError`. Read `isEmailAdmin` from the cached `viewerQueryOptions()`.

**Step 4: Run.** `pnpm exec vitest run src/features/settings src/routes/__tests__`. Expected: PASS.

**Step 5: Checkpoint.** `feat(email): email preferences in settings`.

### Task 18: Signup notice

**Files:**

- Modify: `src/routes/onboarding.tsx` (the final step, near the `StepNav`/finish area around lines 421-433) and `convex/onboarding` completion if a log row is wanted
- Test: `src/features/onboarding/__tests__/…` (extend the nearest onboarding test) and `convex/onboarding.test.ts`

**Step 1: Write failing tests.** The final onboarding step shows "We'll email occasional Locatic updates. Turn them off any time in Settings." Completing onboarding writes one `email_preference_changes` row (`product_updates`, `subscribed: true`, source `signup_default`) if none exists for the user.

**Step 2–4:** Implement the line (muted `text-meta`), log the row in the existing `completeOnboarding` mutation, run the tests. Expected: PASS.

**Step 5: Checkpoint.** `feat(email): tell new members about update emails`.

### Task 19: End-to-end

**Files:**

- Modify: `playwright/email-campaigns.authenticated.spec.ts`, `playwright/fixtures/fixtures.md`
- Create: `playwright/unsubscribe.public.spec.ts`

**Step 1: Update the authenticated spec:** open `/admin/emails` from the account menu, create an update, type a body, wait for the preview iframe to contain the text, send a test to the allowlisted `delivered@resend.dev` (requires `EMAIL_TEST_SENDING_ENABLED=true` and that address in `EMAIL_TEST_RECIPIENTS` on the development deployment; skip with `requireE2EPrerequisite` otherwise), open the send dialog, assert the count text, then cancel the dialog. Never press the final send.

**Step 2: Public spec:** `/unsubscribe?t=invalid` shows the invalid-link message and the page has `noindex`.

**Step 3:** Document the new env prerequisites in `playwright/fixtures/fixtures.md`.

**Step 4: Run.** `pnpm exec playwright test playwright/email-campaigns.authenticated.spec.ts --project=chromium-authenticated` and `pnpm exec playwright test playwright/unsubscribe.public.spec.ts --project=chromium-public`. Expected: PASS against the configured development environment, or an explicit prerequisite skip message.

**Step 5: Checkpoint.** `test(email): end-to-end coverage for campaigns and unsubscribe`.

---

## Phase 6: Finish

### Task 20: Docs and full verification

**Step 1: Docs.** Update `docs/community-email.md` (code map with the final file names: `convex/emailSends.ts`, `convex/emailPreferences.ts`, `convex/emailMigrations.ts`, `src/features/email-preferences/`) and remove the "not implemented yet" status line. Record any deviation from the design (for example Web Crypto in Task 7, form parsing in Task 8) in `docs/plans/2026-10-11-community-email-design.md`.

**Step 2: Leftovers.** Run:

```bash
git grep -n "emailSubscription\|email_contacts\|RESEND_SEGMENT_ID\|RESEND_TOPIC_ID\|EMAIL_CONTACT_SYNC_ENABLED\|RESEND_UNSUBSCRIBE_URL\|emailRefs\|emailClientRefs\|from 'resend'" -- ':!docs'
```

Expected: no output.

**Step 3: Full checks.** `pnpm ci:quality && pnpm ci:build`. Expected: format, lint, contrast, arbitrary-value, collect-call and design-token checks pass; typecheck passes; all Vitest suites pass with coverage thresholds; build and bundle budget pass. Fix only failures caused by this work and report anything pre-existing.

**Step 4: Review.** Run an adversarial review of the full diff against `main` (per the repository owner's review-prompt rules), verify each finding, fix what holds.

**Step 5: Checkpoint.** `docs(email): document the simplified community email`.

---

## Launch checklist (needs explicit authorization for each step)

Production configuration, deployment and real sends are not part of implementation. When authorized:

1. Set production env: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `SITE_URL`, `EMAIL_ADMIN_CLERK_IDS`, `EMAIL_UNSUBSCRIBE_SECRET`, `EMAIL_TEST_RECIPIENTS`; leave `EMAIL_SENDING_ENABLED` unset until step 7.
2. Resend: verify the sending domain (SPF, DKIM, DMARC; consider `updates.locatic.dev`); create the webhook to `https://<prod>.convex.site/resend-webhook` with exactly `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`.
3. Deploy with the optional fields; run `clearLegacyEmailSubscription`, `backfillProductUpdates` and `backfillEmailVerified` (rerun the last for anyone it reports as changed during the run); confirm every user has both fields and none has `emailSubscription`; deploy the tightened schema, which also removes the deprecated `emailSubscription` field. On development, first delete PR #32's tables and old-shape `email_campaigns` documents (see `docs/community-email.md`).
4. On the development deployment, check the runtime assumptions: an unsubscribe token sign/verify round trip in a mutation (Web Crypto), and URL-encoded and multipart one-click POSTs to `/email/unsubscribe`. Fallbacks if either fails: sign tokens in the `requestSend` action; parse URL-encoded bodies with `URLSearchParams`.
5. Turn on `EMAIL_TEST_SENDING_ENABLED`; send a test to a real Gmail inbox. Check rendering and size (no "Message clipped"), the raw headers (DKIM `h=` includes `List-Unsubscribe` and `List-Unsubscribe-Post`), the footer link page, and Gmail's one-click unsubscribe against a throwaway account.
6. Draft the first update with the D7 explanation at the top.
7. Turn on `EMAIL_SENDING_ENABLED`, review the send dialog, send. Switching it off again stops a running send at its next batch (emergency stop).
