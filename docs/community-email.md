# Community email

Convex stores preferences, campaigns, consent history, and send records. The Convex Resend component queues deliveries and processes provider events. The browser does not receive Resend credentials.

## Preferences and recipients

Product updates default on for active members with verified email unless they opt out. Weekly digests are separately opt-in. A cron can prepare a digest draft; an administrator still reviews and sends the campaign.

Every campaign checks current eligibility and preferences. Scheduled sends recheck configuration, the scheduling administrator, and public digest selections. Retries deduplicate by campaign/member rather than sending a second copy.

Members can change preferences in Settings or use signed unsubscribe links without signing in. GET requests do not change consent. The one-click POST endpoint and confirmation page support category opt-out and stop-all; turning email back on requires authentication. Spam complaints turn off both categories for the affected current address. Irreversible account deletion guards prevent old links from recreating erased consent rows.

## Administrator workflow

`EMAIL_ADMIN_CLERK_IDS` controls administrator access, enforced by Convex on every request. `/admin/emails` lists campaigns; a campaign page supports writing, preview, test sends, scheduling, results, and cancellation. `/admin/emails/log` shows delivery records.

Test sends require a separate switch and recipient allowlist. Sending an edition locks its content, then gathers eligible recipients in bounded batches. Stopping cancels queued work where possible; provider-accepted emails cannot be recalled. Delivery states distinguish queued, sent, delivered, bounced, complained, failed, and cancelled. A sent state is not proof of delivery.

## Runtime configuration

| Variable                                                        | Purpose                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `EMAIL_ADMIN_CLERK_IDS`                                         | Clerk user IDs allowed to administer campaigns.                                            |
| `EMAIL_SENDING_ENABLED`                                         | Enables campaign delivery; disabling stops further batches.                                |
| `EMAIL_TEST_SENDING_ENABLED`, `EMAIL_TEST_RECIPIENTS`           | Separate test-send gate and allowed recipients.                                            |
| `EMAIL_UNSUBSCRIBE_SECRET`, `EMAIL_UNSUBSCRIBE_SECRET_PREVIOUS` | Current/previous signing keys; retain the previous key for at least 30 days when rotating. |
| `EMAIL_FROM`, `EMAIL_REPLY_TO`, `SITE_URL`                      | Sender identity and application link origin.                                               |
| `EMAIL_COPY_ADDRESS`, `EMAIL_POSTAL_ADDRESS`                    | Optional campaign-copy destination and footer address.                                     |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`                       | Provider API access and signed delivery events.                                            |

Configure the signed Resend webhook at `https://YOUR-DEPLOYMENT.convex.site/resend-webhook` for the events consumed by `convex/http.ts` and the Resend component. Convex supplies `CONVEX_SITE_URL` for one-click links. Keep sending and contact synchronization disabled in general contributor QA; use isolated test recipients when testing email.

Before enabling a deployment, validate sender/domain configuration, webhook delivery, unsubscribe behavior, audience permissions, and applicable sender/address requirements. Inspect legacy preference/verification rows and migration continuations through [Operations](OPERATIONS.md). Preserve opt-outs and do not treat a backfill as newly granted consent.

## Code reference

- `convex/emailCampaigns.ts`: drafts, audiences, campaign access, and logs.
- `convex/emailSchedule.ts`: scheduling, undo, and campaign-copy settings.
- `convex/emailRender.ts` and `convex/lib/emails/`: rendering and test sends.
- `convex/emailSends.ts`: batches, delivery state, cancellation, and cleanup.
- `convex/emailPreferences.ts`, `convex/lib/unsubscribe_token.ts`, and `convex/http.ts`: preferences and signed unsubscribe handling.
- `convex/emailDigest.ts` and `convex/crons.ts`: draft preparation and scheduled work.
- `src/features/email-campaigns/`: administrator UI.

Retain private operational logs outside the repository. Never paste recipient addresses, campaign content, provider responses, or signing keys into public issues.
