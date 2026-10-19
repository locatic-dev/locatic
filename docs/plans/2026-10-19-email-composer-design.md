# Email composer: autosave, audience, undo send and copies

Date: 2026-10-19. Builds on `feat/email-admin-ux` (separate admin pages, draft delete, sent log) and the community email design (`2026-10-11-community-email-design.md`, decisions D1–D9 still hold).

## Why

Admins found the campaign page clumsy: drafts were created on every New click and could not be removed, there was no way to send to particular members, and nothing protected against a mistaken Send. We looked at Gmail and Superhuman. Their inbox layout does not fit (Locatic sends broadcasts to fewer than 20 members and receives nothing), but four composing patterns do: autosaved drafts with Discard, a To field, Undo send / Send later, and a copy of what went out.

## Decisions (agreed; do not relitigate)

| #   | Decision                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | No CC or BCC for campaigns. CC exposes members' addresses to each other; a shared BCC copy cannot carry each member's unsubscribe link or `List-Unsubscribe` header; events for extra recipients would land on the member's `email_sends` row. |
| C2  | No inbox layout, threads, labels or rich text. Markdown subset stays (D5).                                                                                                                                                                     |
| C3  | Drafts autosave once they have content. Opening New still writes nothing.                                                                                                                                                                      |
| C4  | A campaign's audience is either everyone in its category or up to 50 named members. Opt-outs, verification and activity rules still apply to named members.                                                                                    |
| C5  | Send is delayed 30 seconds and can be undone; Send later picks a time. Both use the Convex scheduler (the Resend component has no `scheduledAt`).                                                                                              |
| C6  | "Send a copy to" defaults to `EMAIL_COPY_ADDRESS` (default `contact@locatic.dev`); the admin can pick their own address or no copy. The copy is a separate email, not recorded in `email_sends`.                                               |
| C7  | Drafts can be deleted in bulk from the list (up to 50 at a time).                                                                                                                                                                              |

## Data model

`email_campaigns` gains:

- `audience: v.optional(union({ kind: 'everyone' }, { kind: 'members', userIds: v.array(v.id('users')) }))`. Missing means everyone, so existing documents stay valid. `userIds` is 1–50 unique ids.
- `state` gains `'scheduled'`.
- `scheduled: v.optional({ sendAt, revision, html, text, scheduledBy, scheduledAt, jobId: v.id('_scheduled_functions'), copyTo: string | null })`. Present only while `state === 'scheduled'`.

The rendered artifact is stored at schedule time so the job that fires is a plain internal mutation: no action, no auth identity, one transaction.

## Autosave (C3)

- New and existing drafts share `/admin/emails/$campaignId`; `new` (with `?kind=update|digest`) is the unsaved composer. One route keeps the editor mounted when the first autosave creates the record, so the caret and anything typed during the save survive; the URL is replaced with the new id.
- A draft "has content" when any of title, subject, preheader, body, button, or digest picks is non-empty. Edits are saved 1 s after typing stops. While a save is in flight further edits wait for it; a newer edit then saves again with the returned revision.
- Status in the header: Saving…, Saved hh:mm, or Couldn't save · Retry. A stale revision pauses autosave and shows the existing Reload banner. `⌘S`/`Ctrl+S` saves immediately.
- Leaving with an unsaved edit still prompts (the router blocker). **Discard draft** deletes the stored draft after confirming, or simply leaves when nothing was stored.
- `createDraft` and `saveDraft` keep their contracts (title fallback, limits, revision check). `saveDraft` also takes `audience`.

## Audience (C4)

- The editor gets a To field above Subject: a chip **All members who get updates** (or **digest subscribers**), or **Specific members…**, which searches members by display name or GitHub username (`searchMembers`, admin-only, up to 8 results) and adds chips. Each chip shows the member's skip reason, if any ("turned updates off · will be skipped").
- `getSendPreview` counts the named members exactly (no cap) or, for everyone, keeps the current first-100 estimate.
- `enqueueBatch` for named members walks `audience.userIds` from a numeric cursor (stored as a string in `sent.cursor`), applies `getSkipReason` and the per-user dedup row exactly as for everyone. A deleted member is skipped.
- `assertSendableCampaign` rejects an empty or oversized member list.

## Undo send and Send later (C5)

- `requestSend({ campaignId, expectedRevision, sendAt, copyTo })` (action) renders as today and calls `scheduleSend` (admin mutation). `sendAt` is `now + 30 s` for Send, or the chosen time (at least 1 minute ahead, at most 30 days).
- `scheduleSend` re-checks draft state, revision, sendability, size and sending enabled, schedules `startScheduledSend` with `runAt(sendAt)`, and sets `state: 'scheduled'` plus `scheduled`.
- `unscheduleSend` (admin mutation): if still `scheduled`, cancels the job, clears `scheduled`, sets `state: 'draft'`. Editing a scheduled campaign requires Undo/Cancel first. `cancelSend` on a scheduled campaign does the same.
- `startScheduledSend` (internal mutation, from the job) does nothing unless the campaign is still `scheduled` with the same `revision` and `jobId`. It re-checks sending enabled, configuration and that `scheduledBy` is still an active allowlisted admin (by Clerk id); if any check fails the campaign returns to `draft` with a `preparationDiagnostics` entry, so it never sends silently later. Otherwise it moves `scheduled` into `sent` (startedAt now, startedBy scheduledBy), sets `state: 'sending'`, enqueues the copy, and schedules `enqueueBatch`.
- The UI shows a banner on scheduled campaigns: "Sending in 0:27 · Undo" or "Scheduled for 21 Oct, 09:00 · Cancel". Scheduled campaigns appear in the list's Sent section with a `scheduled` pill; the To/subject are read-only.

## Copy (C6)

- The send dialog has **Send a copy to**: `EMAIL_COPY_ADDRESS` (default), the admin's own address, or no copy. The resolved address is stored in `scheduled.copyTo`.
- At start, the copy is sent once through the component with subject `[copy] <subject>`, unsubscribe links pointing to Settings, and idempotency key `campaign:<id>:copy`. It respects the component's test mode like any other send.

## Bulk delete (C7)

- `deleteDrafts({ campaignIds })` (admin, at most 50): deletes those still in `draft`, skips the rest, returns `{ deleted }`.
- The Drafts table gets row checkboxes, a select-all checkbox and **Delete N drafts** with a confirmation.

## Error handling

- Autosave failures keep the edit locally and show Retry; nothing is lost on a transient error.
- Scheduling and starting re-check everything in one transaction; a failed start returns the campaign to draft with a visible reason.
- Undo after the job started returns a clear error ("Already sending") and the page shows results.

## Testing

Convex: create-on-content, `deleteDrafts` (mixed states, cap, non-admin), member audience preview and sends (skipped, deleted, dedup, cursor), schedule/unschedule/start (stale revision, disabled sending, removed admin, job id mismatch, double start), copy enqueue (address, idempotency, absent when none). Components: To field, autosave statuses and retry, ⌘S, discard, bulk selection, countdown and Undo, copy option. Playwright: the update flow with Undo instead of a real send.

## Out of scope

CC/BCC, an inbox, segments built from past campaigns, open/click tracking, attachments.

## Plan review (Codex, 2026-10-19) and resulting changes

An adversarial review of this plan found these, all addressed in the implementation:

- **Undo could be outrun by a second request** rendered from the same revision. Scheduling now takes a new revision, so a stale request fails its revision check; Undo names the revision it saw (`unscheduleSend({ campaignId, expectedRevision })`). The job carries `scheduledAt` and ignores a schedule that is not its own (the job cannot learn its own id).
- **Audience on the first save:** `createDraft` takes `audience` too, the detail returns member chips, and the editor's draft carries them, so members chosen before the first autosave survive a reload.
- **Digest privacy at start:** `startScheduledSend` re-runs `assertDigestSelectionsPublic`; a pick that went private returns the campaign to draft with the reason.
- **The 30-second window** is computed in `scheduleSend` after rendering, with server time; a Send later time must be finite and within bounds.
- **Copy recipients** are an enum (`archive | me | none`) resolved on the server; "me" is the admin's address whether or not it is test-allowlisted.
- **Stop sending cancels the copy:** its component email id is stored as `sent.copyEmailId`; cancellation shares `cancelIfWaiting` with member cancellations.
- **The editor survives the first create:** `new` and stored drafts share one route; `CampaignPage` keeps the editor session when the URL moves to the id this session created.
- **Discard during a create** waits for the save in flight and deletes what it created.
- **Visible failures:** `preparationDiagnostics` show on the draft; scheduled campaigns have their own panel (countdown and Undo, or time and Cancel); the list shows their send time.
- **Digest cron:** deleting a cron-prepared digest draft lets the next enabled run prepare it again. Digest preparation is off (D4), so no tombstone is added.
