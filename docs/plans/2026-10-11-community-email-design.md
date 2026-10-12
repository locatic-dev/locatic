# Community email: simplified design

**Status:** design agreed in chat on 2026-10-11 and revised after an adversarial review the same day; implemented on `feat/community-email` on 2026-10-12 (not deployed). Where the code differs from this document, see [Implementation notes](#implementation-notes-2026-10-12). Supersedes the delivery design in [`2026-09-28-community-email-plan.md`](2026-09-28-community-email-plan.md) and [PR #32](https://github.com/locatic-dev/locatic/pull/32). The composer, template, digest draft builder and digest privacy checks from that PR are kept and adapted.

**Goal:** an admin can write a Locatic update, preview it, send a test, and send it to every eligible member, with reliable unsubscribes and no duplicate sends. The fortnightly digest stays built but switched off.

## Why this replaces PR #32's delivery design

PR #32 mirrored the subscriber list into Resend (contacts, a shared segment, a topic), synchronized it in both directions, and created a Resend segment per send. That produced most of its complexity and its blocking defects: unrelated unsynchronized contacts blocked every send, a rejected broadcast could leave a run stuck in `needs_attention`, recipient segment population was unthrottled, topic unsubscribes were ignored, and resubscription never cleared Resend's global unsubscribe. Existing members were never backfilled into `email_contacts`.

Here Convex owns the list and every decision. Resend only delivers, through the official [`@convex-dev/resend`](https://github.com/get-convex/resend) component, and keeps its account-wide suppression list for hard bounces and complaints.

## Decisions (agreed; do not relitigate)

| #   | Decision                                                                                                                                                                    | Reason                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Convex owns the subscriber list; send per recipient through `@convex-dev/resend`. No Resend contacts, segments, topics or Broadcasts.                                       | One source of truth. Fewer than 20 users; the free API quota (100/day, 3,000/month per [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits)) covers that, and a paid plan is acceptable at scale.                                                               |
| D2  | **Locatic updates**: opt-out, on by default. **Weekly digest**: opt-in, off by default.                                                                                     | Product decision.                                                                                                                                                                                                                                                                            |
| D3  | Audience computed while sending, not frozen at review. The confirmation dialog shows a live estimate: count, first five names, skipped counts.                              | Small audience; a frozen cohort adds a snapshot and state machine for little benefit.                                                                                                                                                                                                        |
| D4  | Digest code stays, switched off. Admins can compose a digest by hand; it goes only to digest opt-ins.                                                                       | Agreed scope; digest designed properly later.                                                                                                                                                                                                                                                |
| D5  | Editor content: subject, preheader, Markdown subset body, optional call-to-action button. Projects and discussions are digest-only.                                         | Updates need links and a CTA.                                                                                                                                                                                                                                                                |
| D6  | Admins are an env allowlist (`EMAIL_ADMIN_CLERK_IDS`), exposed to the UI through `isEmailAdmin`.                                                                            | One or two admins.                                                                                                                                                                                                                                                                           |
| D7  | Existing members are backfilled to updates **on**. The first update says why they receive it and puts the unsubscribe link at the top.                                      | Product decision, accepting weaker EU/UK soft-opt-in standing for the few existing members. New members see a notice and an opt-out at signup.                                                                                                                                               |
| D8  | No postal address yet. `EMAIL_POSTAL_ADDRESS` is optional and shown in the footer when set. Updates stay limited to news about Locatic's features and the member's account. | CAN-SPAM requires an address only for commercial messages ([FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)). Add a USPS PO box or registered virtual mailbox before sending anything promotional (paid plans, sponsors, partner offers). |
| D9  | No Undo on the unsubscribe page. Resubscribing requires signing in to Settings.                                                                                             | A forwarded email must not be able to resubscribe its owner.                                                                                                                                                                                                                                 |

Not legal advice: D7 and D8 are accepted product risks, recorded so they can be revisited when Locatic grows or starts charging.

## Architecture

| Part                                 | Owns                                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clerk                                | Identity, the primary email address and whether it is verified. Reports changes by signed webhook (existing).                                                                                |
| Convex                               | Preferences, consent log, campaigns, per-recipient send records, eligibility, unsubscribe endpoints.                                                                                         |
| `@convex-dev/resend` (inside Convex) | Durable queue, batching to `/emails/batch`, retries, rate limits, Resend idempotency keys, delivery-event webhook with an `onEmailEvent` callback.                                           |
| Resend                               | Delivery and the account suppression list, which also applies to API sends ([suppression support](https://resend.com/changelog/suppression-list-support)). Holds no copy of the member list. |

Pin `@convex-dev/resend@0.2.8` (published 2026-09-01; 0.2.9 was published 2026-10-10 and should soak first). Add `convex-helpers` (peer, `^0.1.106`). Register the component in `convex/convex.config.ts`.

Facts verified in the [0.2.8 source](https://github.com/get-convex/resend/tree/v0.2.8): `sendEmail` accepts `headers` and `idempotencyKey` and runs inside a mutation; component writes commit or roll back with the caller's transaction ([component transactions](https://docs.convex.dev/components/using#transactions)); `cancelEmail` **throws** unless the component status is `waiting` or `queued`; API failures and exhausted retries mark emails `failed` **without** calling `onEmailEvent`; the webhook handles `email.sent`, `delivered`, `delivery_delayed`, `bounced`, `complained`, `failed`, `opened`, `clicked` and not `email.suppressed`.

**Test mode.** The component's `testMode` (an address restriction, not a mock) is off only when `EMAIL_SENDING_ENABLED` or `EMAIL_TEST_SENDING_ENABLED` is `'true'`. Campaign sends also require `EMAIL_SENDING_ENABLED`; test sends also require `EMAIL_TEST_SENDING_ENABLED` and the recipient allowlist.

## Data model

New fields on existing documents start optional, are backfilled, then become required ([Convex schemas](https://docs.convex.dev/database/schemas)). Every user-creation path, including `createDefaultViewerProfile`, sets them before they are tightened.

```ts
// users (existing)
emailVerified: v.optional(v.boolean()), // from Clerk; backfill, then required
emailChangedAt: v.optional(v.number()), // set when the primary address changes
notificationPrefs: {
  // ...existing keys
  weeklyDigest: v.boolean(), // unchanged, default false
  productUpdates: v.optional(v.boolean()), // read as `?? true`; backfill, then required
}

email_preference_changes: defineTable({
  userId: v.id('users'),
  category: v.union(v.literal('product_updates'), v.literal('weekly_digest')),
  subscribed: v.boolean(),
  source: v.union(
    v.literal('settings'),
    v.literal('unsubscribe_link'),
    v.literal('one_click'),
    v.literal('complaint'),
    v.literal('backfill'),
    v.literal('signup_default'),
  ),
  changedAt: v.number(),
}).index('by_user_and_changed_at', ['userId', 'changedAt'])

email_campaigns: defineTable({
  title: v.string(),
  subject: v.string(),
  preheader: v.string(),
  revision: v.number(),
  state: v.union(v.literal('draft'), v.literal('sending'), v.literal('sent'), v.literal('cancelled')),
  content: v.union(
    v.object({ kind: v.literal('announcement'), body: v.string(), cta: ctaOrNull }),
    v.object({
      kind: v.literal('digest'),
      body: v.string(),
      cta: ctaOrNull,
      periodKey: v.string(),
      periodStart: v.number(),
      periodEnd: v.number(),
      projects: v.array(emailProjectSelectionValidator),
      discussions: v.array(emailDiscussionSelectionValidator),
    }),
  ),
  // Set once by startSend: the exact artifact sent, and enqueue progress.
  sent: v.optional(
    v.object({
      revision: v.number(),
      html: v.string(), // contains the unsubscribe-URL placeholder
      text: v.string(),
      startedAt: v.number(),
      startedBy: v.id('users'),
      cursor: v.union(v.string(), v.null()), // next users page; null before the first batch
      lastBatchAt: v.number(),
      enqueuedAt: v.optional(v.number()), // every user visited
    }),
  ),
  createdBy: v.id('users'),
  updatedBy: v.id('users'),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_updated_at', ['updatedAt'])
  .index('by_content_kind_and_period_key', ['content.kind', 'content.periodKey'])

email_sends: defineTable({
  campaignId: v.id('email_campaigns'),
  userId: v.id('users'),
  emailId: v.string(), // component EmailId
  status: v.union(
    v.literal('queued'),
    v.literal('sent'),
    v.literal('delivered'),
    v.literal('bounced'),
    v.literal('complained'),
    v.literal('failed'),
    v.literal('cancelled'),
  ),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_campaign_and_user', ['campaignId', 'userId']) // dedup + per-campaign list
  .index('by_email_id', ['emailId']) // event lookup
  .index('by_user_and_status', ['userId', 'status']) // cancel on opt-out / address change
  .index('by_status_and_updated_at', ['status', 'updatedAt']) // reconciliation

email_digest_config // kept as in PR #32; disabled by default
```

- `email_sends` duplicates the component's status on purpose: component records are deleted by the retention cron, and `email_sends` keeps per-campaign results without addresses.
- Campaign totals are counted from `email_sends` by index. `@convex-dev/aggregate` is the upgrade path if counting gets slow.
- **Content limits** (checked on save, preview and send): subject 140, preheader 200, body 20,000 characters; CTA label 40; URLs https only, 2,000 characters; rendered HTML at most 100 KB. Gmail clips messages over about 102 KB, which would hide the unsubscribe footer. The cap also keeps a 100-email batch well under Convex's 16 MiB-per-transaction write limit ([limits](https://docs.convex.dev/production/state/limits)).

## Eligibility

Checked for each user when the enqueue batch visits them:

1. Not deleted, not deactivated, not pending purge.
2. `emailVerified === true` and the address passes the existing usability check.
3. Category preference on: `productUpdates ?? true` for announcements, `weeklyDigest` for digests.
4. No `email_sends` row for this campaign and user.

Batches page `users` in ascending creation order with a stored cursor, and finish only when the page reports `isDone` ([pagination](https://docs.convex.dev/database/pagination)). A user skipped when visited is not revisited; users created during a send are included only if the scan reaches them. This is the meaning of D3.

## Send flow

1. **Preview.** A Node action receives the current, unsaved editor content plus a client request number, validates it against the content limits and the Markdown allowlist (paragraphs, bold, https links, bullet lists; no raw HTML or images), renders it with React Email, and returns HTML and the request number. The client debounces about 500 ms and ignores any response older than its latest request. Nothing is stored.
2. **Test send.** Same render, sent through the component to one `EMAIL_TEST_RECIPIENTS` address with `[test]` in the subject and the unsubscribe link pointing at Settings. No `email_sends` row. Limit: five per admin per hour (existing rate limiter).
3. **Confirmation.** `getSendPreview(campaignId)` returns the estimated count, the first five eligible names (display name and GitHub handle, no addresses) and skipped counts. The dialog says the number is an estimate; results show actual outcomes.
4. **Start.** A public action checks admin rights and renders the **saved** revision with an unsubscribe-URL placeholder. It then calls the internal mutation `startSend({ campaignId, expectedRevision, html, text })`, which in one transaction re-checks: admin rights, `EMAIL_SENDING_ENABLED` and required configuration, `state === 'draft'`, `revision === expectedRevision`, content limits, and for digests that every selected project and discussion is still public (PR #32's `getSourceFingerprint` checks). On success it stores `sent`, moves the campaign to `sending`, and schedules the first `enqueueBatch`. Any mismatch rejects the send with a message. Edits are allowed only in `draft`.
5. **Enqueue.** `enqueueBatch(campaignId)` stops unless the campaign is `sending`. It reads the next page of up to 100 users from `sent.cursor`. For each eligible user it signs an unsubscribe token, fills the per-recipient link into HTML and text, and calls `resend.sendEmail` with:
   - `List-Unsubscribe: <https://<deployment>.convex.site/email/unsubscribe?t=…>`
   - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
   - `idempotencyKey: campaign:<campaignId>:user:<userId>`

   It inserts an `email_sends` row (`queued`) in the same transaction, then stores the next cursor and `lastBatchAt`. It schedules itself again, or on `isDone` sets `sent.enqueuedAt` and `state: 'sent'`.

`state: 'sent'` means every user was visited. Delivery progress comes from `email_sends` counts.

**Reliability.** Each batch is one transaction: the emails and their `email_sends` rows commit together or not at all. Convex retries scheduled mutations after internal errors but not after developer errors ([scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions#error-handling)), so a batch that throws stops the chain with the campaign still `sending`. The admin page shows **Resume** when a campaign has been `sending` with no batch for five minutes. Resume reschedules `enqueueBatch` from the stored cursor, and the per-user dedup check makes this safe. No `needs_attention` state, no recovery crons for sending, and campaigns can run concurrently.

## Status, events and reconciliation

- `onEmailEvent` updates `email_sends` by `emailId` with forward-only precedence: `queued` < `sent` < `delivered`. `bounced`, `complained`, `failed` and `cancelled` are terminal and never downgraded. A late `delivered` cannot overwrite `complained`.
- The first transition to `complained` turns both preferences off (source `complaint`) and schedules cancellation of that user's waiting sends. Repeated complaint events for the same send do nothing.
- **Reconciliation cron** (every 15 minutes, bounded to 100 rows): reads `email_sends` that are `queued` or `sent` and older than 15 minutes, asks `resend.status`, and copies terminal results (`failed`, `cancelled`, `bounced`, `delivered`). It runs well inside the component's 30-day retention, so results are persisted before the component deletes them. This covers API failures and exhausted retries, which emit no callback.
- Configure the Resend webhook for exactly the events the component handles (`email.sent`, `delivered`, `delivery_delayed`, `bounced`, `complained`, `failed`). `email.suppressed` is not handled in 0.2.8. A suppressed address shows as `sent` that never reaches `delivered`, and the status line in Settings covers the member-facing case.

## Cancelling

Only component emails in `waiting` are cancelled. Emails already in a batch (`queued`) may be in flight to Resend, and cancelling them could conflict with that batch's idempotent retry.

`cancelWaitingSends({ userId? , campaignId? })` is an internal mutation that, for up to 100 matching `email_sends` rows in `queued`, reads `resend.status` and calls `cancelEmail` only when the component status is `waiting`, then records `cancelled`. Rows it cannot cancel are left for the events and reconciliation. It never throws for an already-sent email, and it runs in its own transaction, so it can never roll back the change that requested it.

- **Admin cancel** (while `sending`, or while any of the campaign's sends are still `queued`): sets the campaign to `cancelled` if it was `sending` (stopping further batches) and schedules `cancelWaitingSends({ campaignId })` until none remain. The UI says that emails already handed to Resend cannot be recalled.
- **Opt-out, account deletion or deactivation, address change:** schedule `cancelWaitingSends({ userId })`. Later batches re-check eligibility anyway.

## Unsubscribe

**Single writer.** `setEmailPreference(userId, category, subscribed, source)` is the only code that changes email preferences. In one transaction it patches the one preference key, appends `email_preference_changes` only when the value actually changes, and on unsubscribe schedules `cancelWaitingSends({ userId })`. Settings, both unsubscribe paths and the complaint handler call it. The existing settings mutation, which replaces the whole `notificationPrefs` object (`convex/users.ts` `updateNotificationPrefs`), changes to update one key per call, so a stale browser tab cannot restore an old email preference.

**Token.** `userId.category.signature`, with `signature = base64url(HMAC-SHA256(secret, "userId:category"))`, checked in constant time with Web Crypto ([runtimes](https://docs.convex.dev/functions/runtimes)). Tokens do not expire. Verification accepts `EMAIL_UNSUBSCRIBE_SECRET` and, when set, `EMAIL_UNSUBSCRIBE_SECRET_PREVIOUS`; after rotating, keep the previous secret for at least 30 days after the last email signed with it (CAN-SPAM requires opt-out to work for 30 days). A malformed or invalid token is rejected without changes. A valid token for a user who no longer exists returns success with no change.

| Path                                                          | Source                                                                                                         | Behaviour                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST https://<deployment>.convex.site/email/unsubscribe?t=…` | `List-Unsubscribe` header; mail clients' one-click button ([RFC 8058](https://www.rfc-editor.org/rfc/rfc8058)) | Requires the body field `List-Unsubscribe=One-Click` (URL-encoded or multipart); otherwise `400` with no change. Valid: unsubscribe (source `one_click`), empty `200`. No redirects, cookies or login. Repeating it is harmless. A `GET` to this URL redirects to the page below and changes nothing. |
| `GET https://<SITE_URL>/unsubscribe?t=…`                      | Footer link                                                                                                    | Public page asking "Stop Locatic updates for this address?". Only the button calls `unsubscribeWithToken` (source `unsubscribe_link`). After that it offers **"Stop all Locatic email"** (both categories, using the same token's user) and a link to Settings. No Undo (D9).                         |

GET requests never change state, because corporate link scanners prefetch links ([Resend guidance](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails)). A `*.convex.site` URL in the header is allowed by RFC 8058; a `mailto:` alternative is optional and omitted.

## Settings and consent

- **Locatic updates** toggle (default on): "Product news and announcements, a couple of times a month at most."
- **Weekly digest email** toggle (default off): "Not sending yet; we'll email you when it starts."
- Status line only when delivery is blocked: email not verified; or a send created after `emailChangedAt` bounced or drew a complaint. Turning the toggle on does not lift Resend's suppression; an admin must remove the address in Resend's dashboard, and the line says so.
- New members: one line at signup, "We'll email occasional Locatic updates. Turn them off any time in Settings," with the switch available there (preference logged as `signup_default`).
- Existing members (D7): backfilled on (`backfill`). The first update opens with why they receive it and the unsubscribe link.
- Footer: who sent it, why the member receives it, unsubscribe link, link to Settings, and `EMAIL_POSTAL_ADDRESS` when set (D8).

## Clerk and email-address changes

- The Clerk webhook sets `email`, `emailVerified` and, when the address changes, `emailChangedAt`, then schedules `cancelWaitingSends({ userId })`.
- **Backfill of `emailVerified`:** page Convex users (100), fetch those users from Clerk by ID (the Backend API accepts up to 100 user IDs per list call; [Clerk users](https://clerk.com/docs/reference/backend/user/get-user-list)), and write `emailVerified` only when Clerk's primary address equals the stored `users.email`. Otherwise skip; the webhook owns newer data. Missing Clerk users are skipped. On `429`, reschedule after `Retry-After` ([limits](https://clerk.com/docs/guides/how-clerk-works/system-limits)).

## Admin page

- **Access.** `viewerBootstrap` gains `isEmailAdmin`. `_app`'s `beforeLoad` already loads that query after the root route sets the Convex token, on SSR and on client navigation, and uses it for the onboarding redirect; the admin route reads the same cached result and redirects non-admins to `/home` before any privileged query. The account menu in the sidebar footer shows "email campaigns" for admins; on mobile, the settings page shows the same link. Every Convex function still checks admin rights.
- **Layout.** Left: campaign list with title, `status-pill`, type and "sent to N · M delivered". Right: Write / Test / Send tabs. Write has the fields and the live preview (side by side on desktop, a tab on mobile). Test prefills the admin's address when allowlisted. Send opens the confirmation `dialog`, with names in `person-row`.
- **After sending.** Read-only results: counts by status, recipient table (name, status, time), Cancel while sends are `queued`, Resume when stalled.
- **Implementation.** `sonner` toasts; plain-language copy. Split the current component into `CampaignList`, `CampaignEditor`, `PreviewPane`, `SendDialog`, `CampaignResults`, each with local busy state (`convex/react` hooks expose no pending state). Revision check on save stays.

## Environment

| Variable                                                        | Purpose                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`                       | Component credentials and webhook verification.                                          |
| `EMAIL_FROM`, `EMAIL_REPLY_TO`                                  | Sender identity.                                                                         |
| `EMAIL_ADMIN_CLERK_IDS`                                         | Admin allowlist.                                                                         |
| `EMAIL_SENDING_ENABLED`                                         | Gate for campaign sends.                                                                 |
| `EMAIL_TEST_SENDING_ENABLED`, `EMAIL_TEST_RECIPIENTS`           | Gate and allowlist for test sends.                                                       |
| `EMAIL_UNSUBSCRIBE_SECRET`, `EMAIL_UNSUBSCRIBE_SECRET_PREVIOUS` | Unsubscribe token signing and rotation.                                                  |
| `EMAIL_POSTAL_ADDRESS`                                          | Optional footer address (D8).                                                            |
| `SITE_URL`                                                      | New. Base for footer links and project links, replacing hardcoded `https://locatic.dev`. |

## Retention and deletion

- Component cleanup cron: `cleanupOldEmails` for finalized emails older than 30 days, `cleanupAbandonedEmails` older than 60 days, hourly ([0.2.8 retention](https://github.com/get-convex/resend/blob/v0.2.8/src/component/lib.ts)). Component records contain recipient addresses until then.
- `email_sends` and `email_preference_changes` store user IDs, not addresses, and are deleted on account purge. Purge does not delete component records early; they expire on the schedule above.

## Removal and change inventory (from PR #32)

- **Tables:** `email_contacts`, `email_contact_cleanups`, `email_campaign_runs`, `email_campaign_recipients`. Field `users.emailSubscription` and its validator.
- **Files:** `convex/emailContacts.ts`, `convex/emailDelivery.ts`, `convex/emailDeliveryState.ts`, `convex/emailEvents.ts`, `convex/lib/email_contacts.ts`, `convex/lib/resend_contract.ts`, `convex/lib/email_function_refs.ts`, `src/integrations/convex/email-function-refs.ts` (use generated `api`/`internal`). Adapt `convex/lib/email_provider.ts` to configuration only. Their tests and `emailReviewRegressions.test.ts`.
- **Callers in `convex/users.ts`:** `requestAccountDeletion`, `updateNotificationPrefs`, `deactivateAccount`, `scrubDeletedAccount`, `upsertFromClerkWebhook` switch from contact sync to `setEmailPreference` / `cancelWaitingSends` / the new user fields. `createDefaultViewerProfile` in `convex/lib/viewer.ts` sets the new fields.
- **HTTP and crons:** remove the `/resend/webhooks` route and the three recovery crons; add the component route `/resend-webhook`, the one-click route, the reconciliation cron and the retention cron. Keep the digest cron (disabled) and `webhook_events` for Clerk deduplication.
- **Frontend:** settings email status query and copy, `src/integrations/convex/query-options.ts` entries, campaign contracts and hooks, recovery and "retry failed contacts" UI, tests and the Playwright fixture notes.
- **Dependencies:** add `@convex-dev/resend@0.2.8` and `convex-helpers`; remove the direct `resend` dependency if nothing uses it; leave `svix` as it was on main. Keep the `emailTestSend` rate limit.
- **Generated code:** regenerate `convex/_generated` and the route tree with the repository's tooling; never edit by hand.
- **Docs:** mark the 2026-09-28 plan's preference, review and delivery sections superseded by this document; keep `docs/community-email.md` in step.

## Testing

Use `convex-test` with the component registered through `@convex-dev/resend/test`, so component behaviour is real rather than faked. It proves application and component contracts, not real delivery.

| Guarantee             | Cases                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No duplicates         | Overlapping batches; two start clicks; start action retried after a successful commit; Resume after a stalled batch; a forced failure after enqueue leaves neither the email nor the row                                                                    |
| Correct artifact      | Save during rendering rejected at commit; stale revision rejected; digest pick made private or deleted rejects the send; content limits enforced                                                                                                            |
| Opt-out               | Settings, link, one-click and complaint paths; opt-out while the user's email is `waiting` (cancelled) and already `queued` or `sent` (opt-out still commits); repeated requests log once; stale settings tab cannot resubscribe; deletion and deactivation |
| Delivery results      | API failure and exhausted retries reconciled; out-of-order and duplicate events; complaint side effect once; results persisted before retention cleanup                                                                                                     |
| Pagination            | 0, 99, 100, 101, 200, 201 users; an all-ineligible page; users inserted and deleted between pages; a user verified behind the cursor is not revisited                                                                                                       |
| Identity              | Backfill races a webhook; missing Clerk user; primary-address change cancels waiting sends; every constructor sets required fields                                                                                                                          |
| Unsubscribe endpoints | URL-encoded and multipart POST; missing body field; malformed and tampered tokens; wrong category; rotated secret; GET changes nothing; "Stop all"                                                                                                          |
| UI and accessibility  | Cold SSR as admin and non-admin; client navigation during auth loading; stale preview responses ignored; dialog and tab keyboard operation and focus; invalid-token and failed-request states on the public page                                            |

Playwright (authenticated): write, preview, send a test with `EMAIL_TEST_SENDING_ENABLED` on to an allowlisted `delivered@resend.dev` address, open the confirmation dialog without sending.

Manual before launch, in a real Gmail inbox: rendering and size (no clipping), both unsubscribe paths, Settings reflect the change, and the raw message shows a DKIM signature whose `h=` covers `List-Unsubscribe` and `List-Unsubscribe-Post`. Gmail showing its own Unsubscribe button is a bonus, not the pass criterion ([Gmail sender guidelines](https://support.google.com/mail/answer/81126)).

## Rollout

1. Clear PR #32 test data from the development deployment (it was not deployed to production), then remove and change what the inventory lists.
2. Add the component, schema and code. Run the backfills: `productUpdates = true` (logged `backfill`) and `emailVerified` from Clerk.
3. Tighten optional fields to required after the backfills.
4. Resend: verify the sending domain (SPF, DKIM, DMARC); consider a subdomain such as `updates.locatic.dev`; point the webhook at `/resend-webhook` with the six supported events; set the secrets.
5. Send the first edition to the test inbox, check it manually, then send to everyone.

## Out of scope

Automatic digest sending, per-user cadence, segmentation, A/B tests, open/click analytics, rich-text editor, attachments, multiple sender identities, promotional content (see D8).

## Implementation notes (2026-10-12)

Where the implementation differs from this design or from [the implementation plan](2026-10-11-community-email-implementation.md), and why.

**Not done yet**

- **Required fields.** `emailVerified` and `notificationPrefs.productUpdates` stay optional. Making them required before the backfills run on a deployment would fail that deployment's schema validation, so tightening (plan Task 13 Step 6) is a follow-up after rollout step 2; `isSubscribed` still reads `productUpdates ?? true` until then.
- **Runtime checks (decision C).** Convex's [runtime docs](https://docs.convex.dev/functions/runtimes) list Web Crypto (`crypto.subtle`) in the default runtime, and the [HTTP actions docs](https://docs.convex.dev/functions/http-actions) document `Request.formData()`. HMAC signing inside mutations (`convex/lib/unsubscribe_token.ts`) and multipart parsing in the one-click endpoint (`convex/http.ts`) pass in `convex-test` (Node) but are not yet verified on a deployment. Pre-launch check: a token sign/verify round trip in a mutation, and URL-encoded and multipart one-click POSTs against the development deployment. Fallbacks: sign tokens in the `requestSend` action and pass them into batches; parse URL-encoded bodies with `URLSearchParams(await request.text())`.

**Review fixes (2026-10-12, round 2)**

- **Per-email size budget (batch writes).** Only the HTML was capped, but each recipient stores both HTML and text, so 100 recipients of a 95 KB + 85 KB email wrote about 18 MB in one batch and failed Convex's 16 MiB transaction limit on every Resume. `emailBytes(html, text)` now counts HTML + text + 512 bytes per unsubscribe placeholder + 4 KB per-recipient records, and `assertEmailSize` caps it at 120,000 bytes at preview, test send, `requestSend` and `startSend` (the 100 KB HTML clipping cap stays). The component reads up to 100 emails' content in one query, so 100 × 120 KB = 12 MB stays under 16 MiB. `enqueueBatch` also sizes its page from the stored email (`enqueuePageSize`: at most 100, and at most 8 MiB of emails per batch). Proven with `convexTest({ transactionLimits: true })`.
- **Cancellation by category.** `email_sends` stores `category`. An opt-out (settings, link, one-click, complaint) cancels only that category's waiting sends; "Stop all" and complaints cancel both (one job each). Deletion, deactivation and address or verification changes stay broad.
- **Cancellation cutoff.** User-scoped cancellation jobs carry `before` (the time of the change) and only cancel sends created at or before it, through the `(userId, [category,] status, createdAt)` indexes. A send enqueued later passed a fresh eligibility check (re-enabled category, new address) and is kept. A send created in the same millisecond as the change is cancelled, erring toward the opt-out.
- **Backfill freshness.** `backfillEmailVerified` carries each member's `email`, `emailVerified` and `updatedAt` from before the Clerk lookup; `applyEmailVerified` skips (and logs) anyone changed since, so a webhook decision made during the lookup wins even at the same address.
- **Complaints after another outcome.** The first complaint for a send turns preferences off and stamps `complaintHandledAt`, whatever the send's status was (bounced, failed, delivered). The displayed status keeps its forward-only rule, and repeats are ignored, including after the member turns email back on.
- **Reconciliation fairness.** Each run gives half its 100 slots to `queued` rows and half to `sent` rows, with unused slots going to the other status, so a large queued backlog no longer starves `sent` rows. (Round 3 changed which rows are candidates; see below.)
- **Lifecycle fields.** Eligibility uses nullish checks for `deletedAt`, `deactivatedAt` and `purgeAfter`, since `purgeAfter` is absent on older users.
- **Stop sending.** The results view offers "Stop sending" whenever a campaign is still `sending` (even with nothing waiting, and next to Resume when stalled), and "Cancel emails not sent yet" afterwards while sends wait.
- **Preview staleness.** Every edit takes a new request number at once, before the debounce, so a response for older content is ignored even when it lands while the next edit is debouncing, and the loading state stays on.
- **Unsubscribe page.** The route keys the page by token, so a different link starts fresh and a late answer for the previous token is dropped.

**Review fixes (2026-10-12, round 3)**

- **What `sent` means, and suppression.** `sent` means "handed to Resend; delivery not confirmed". Component 0.2.8 rejects the `email.suppressed` webhook event, so an address Resend suppresses (for example after an earlier bounce or complaint) never produces a delivery event and its row stays `sent`. A dedicated `email.suppressed` handler is deferred: the component offers no lookup from a Resend id to its email id, and the case is rare at Locatic's size.
- **Reconciliation window.** `reconcileSends` only considers rows created in the last 25 days, inside the component's 30-day retention of finalized copies, through a new `by_status_and_created_at` index (it replaces `by_status_and_updated_at`). Of the oldest 500 in-window rows per status untouched for 15 minutes, the least recently checked are taken, keeping the 50/50 split. Older rows keep their status. When the component copy is missing, a `sent` row stays `sent` instead of becoming `failed`. A `queued` row still becomes `failed` with "No delivery record": inside the window its copy can only be missing if it never left Locatic.
- **Settings complaint warning.** `myEmailStatus` finds complaints through `complaintHandledAt` (new index `by_user_and_complaint_handled_at`), whatever the send's displayed status, counting only sends created after `emailChangedAt`; the bounce check stays. A complaint on a send that had failed or been cancelled now shows the warning, also after the member turns email back on.
- **Purged accounts.** `setEmailPreference` changes nothing for an account with `purgedAt` (the tombstone a purge leaves), so an old footer link, one-click POST or "Stop all" still answers success but writes no consent record. `backfillProductUpdates` writes no consent row for tombstones; it sets their `productUpdates` to `false` so the field can become required.
- **`emailVerified` backfill completes.** Members Clerk no longer has (including purged tombstones), members without a primary address, and members whose stored address differs from Clerk's primary one all get `false` through the same snapshot check. Each page logs counts per outcome. Members changed during the lookup are still skipped and listed for a rerun, so a rerun ends with every member having the field.
- **Legacy field.** The development deployment may hold users with PR #32's `emailSubscription`, which would fail the next schema push. The schema keeps `emailSubscription: v.optional(v.any())`, marked deprecated, and `emailMigrations.clearLegacyEmailSubscription` unsets it page by page. Run it before the follow-up that makes `emailVerified` and `productUpdates` required, and remove the field in that same follow-up. (The removal inventory above listed this field as removed.)

**Decisions (2026-10-12)**

- **A. Emergency stop.** `EMAIL_SENDING_ENABLED` is checked at the start of every batch. When it is off, the chain stops without scheduling another batch and the campaign stays `sending`, so the admin page shows it stalled. Waiting component emails are not cancelled automatically; the admin can press Stop sending. `resumeSend` refuses while the switch is off and continues from the stored cursor once it is back on.
- **B. Send estimate read size.** `getSendPreview` reads at most the first 100 members (`take(101)` to detect more), because full user documents carry about 15 KB of contribution history. A capped estimate shows as "N+" with a note that it was counted from the first 100 members. A capped zero is incomplete and does not block sending ("Send to everyone eligible"); only an uncapped zero does.
- **C. Web Crypto and multipart.** See "Runtime checks" above.

**Sending and status**

- `startSend` also requires `CONVEX_SITE_URL` (for the one-click URL) and `RESEND_API_KEY` (the component's `sendEmail` throws without it). `requestSend` checks `EMAIL_SENDING_ENABLED` before rendering so a switched-off environment fails fast; `startSend` still re-checks everything.
- `cancelWaitingSends` pages through `queued` rows with a cursor. Re-reading "the first 100 queued rows" would get stuck on rows already in a Resend batch, which stay `queued` and are never cancellable.
- `cancelSend` is refused only for drafts. It also works for `sent` and `cancelled` campaigns so an admin can cancel emails still waiting after every member was visited.
- Reconciliation also moves rows forward to `sent`, and treats the component's `complained` flag as a complaint, with the same side effect as the webhook (both preferences off). A `queued` row whose component record is gone becomes `failed` with "No delivery record"; a `sent` row stays `sent` (round 3).
- The Clerk webhook also cancels waiting sends when a verified address becomes unverified, not only when the address changes.
- Account purge schedules `emailSends.purgeUserEmailRecords`, which deletes send rows and consent rows 500 at a time and reschedules itself, instead of adding unbounded reads to `scrubDeletedAccount`.
- `getSendPreview` reads 100 members, not 1,000 (decision B).
- Result counts in `get` stop at 1,000 per status (the plan said 5,000) to bound reads at about 7,000 documents. The campaign list adds `results: { total, delivered, capped }`, capped at 100 per campaign, for "sent to N · M delivered".
- `get` drops `latestRun` and adds `sending` timestamps, the sending switches, the test allowlist and `defaultTestRecipient` (the admin's own address when allowlisted) for the workspace.

**Content and rendering**

- A body link may target `{{UNSUBSCRIBE_URL}}`, so the first update can open with the reader's own unsubscribe link (D7). Markdown percent-encodes the braces; the renderer maps that back. All other non-HTTPS links render as plain text.
- The template takes no `category` prop; the footer reason follows the content kind. The footer's Settings link goes to `/settings?tab=notifications`.
- The plain-text part renders the Markdown body to HTML and converts it with `@react-email/render`'s `toPlainText` (links as `text (url)`), so `renderCampaignText` is async.
- `UNSUBSCRIBE_URL_PLACEHOLDER` lives in `convex/lib/emails/placeholders.ts` so `enqueueBatch` does not bundle React into the default runtime, and `convex/lib/emails/render.ts` is marked `'use node'`.
- Links in content must be valid HTTPS URLs of at most 2,000 characters ("Link is too long"). Saving a digest keeps its stored period fields, so a client cannot move the period the digest cron deduplicates on.
- `SITE_URL` replaces hardcoded origins through `getSiteUrl()`, which falls back to `https://locatic.dev` for project links, previews and the GET redirect; campaign and test sends still require it.

**Preferences, backfills and onboarding**

- The Clerk lookup is isolated in `convex/lib/clerk_users.ts` so tests can mock it. The backfill action runs in the default runtime (deployment bundling accepted `@clerk/backend` there). A 429 without `Retry-After` waits 60 seconds.
- The signup notice shows under the last onboarding step (repos or follow, whichever is last). `completeOnboarding` logs `signup_default` only when the member has no consent row yet and is still subscribed.

**Admin and pages**

- `ViewerBootstrapPayload.isEmailAdmin` is optional on the client; missing reads as not an admin.
- Settings prefetches `myEmailStatus` during SSR alongside the profile.
- The Write tab shows editor and preview side by side from the `lg` breakpoint and as Edit / Preview tabs below it. The recipient list uses Convex's `usePaginatedQuery`, since paginated queries do not fit the TanStack query-option helpers.
- Test sends check the allowlist and render before spending a rate-limit token; the internal enqueue re-checks the allowlist.
- The unsubscribe page names the weekly digest in its question when the link is for the digest, and treats a missing token as an invalid link without calling the server. A malformed but present token is only reported invalid after the button is pressed, because the server verifies it.
- Playwright no longer needs `E2E_EMAIL_CAMPAIGN_TITLE`: the admin spec creates a draft each run and sends one test to `delivered@resend.dev`. The public axe run includes `/unsubscribe`.
