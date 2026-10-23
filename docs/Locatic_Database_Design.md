# Data model

[convex/schema.ts](../convex/schema.ts) defines the stored fields and indexes. [Validators](../convex/lib/validators.ts) and each public function define request/response contracts. Use those sources rather than copying a historical schema example.

## Table groups

| Area                   | Tables                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Identity and locations | `users`, `cities`, `github_tokens`, `webhook_events`                                                          |
| Projects and discovery | `projects`, `project_contributors`, `project_releases`, `posts`, `explore_history`, `explore_post_history`    |
| Social activity        | `reaction_config`, `reactions`, `comments`, `follows`, `saved_projects`, `activity_events`, `home_feed_items` |
| Inbox                  | `conversations`, `messages`, `notifications`                                                                  |
| Email                  | `email_campaigns`, `email_sends`, `email_preference_changes`, `email_digest_config`                           |
| Maintenance            | `github_sync_log`, `contributor_sync_config`, `reports`, `metrics_daily`                                      |
| Compatibility and QA   | Deprecated `pulse_snapshots`; isolated `development_fixture_state`                                            |

Clerk holds GitHub OAuth credentials. `github_tokens` stores connection health, scopes, and diagnostics, not access tokens. Signed webhooks reconcile provider identity; import actions verify the token's stable GitHub identity and repository permissions.

## Privacy and synchronization

Public projections exclude private account fields and resolve current profile, location, and lifecycle authority. Exact-city membership, region disclosure, and hidden location are separate from global discovery participation. See [Discovery and Home](explore-home-logic.md).

User authority and builder city deltas commit immediately. `startLifecycleOwnerSync` in `convex/lib/lifecycle_owner_sync.ts` updates copied project/post state in indexed pages. Its generation, stage, and cursor commit with each page and scheduled continuation; newer generations supersede old ones. Public reads enforce restrictive privacy before copies catch up. Project city counters and indexes converge asynchronously.

## Account lifecycle

Deletion denies ordinary member actions and starts a 30-day recovery window. Restoration checks the server deadline. Cleanup becomes irreversible when purge starts. `users.purgeProgress` tracks bounded resumable cleanup of owned records and copied content, including survivor counters. Historical cross-account copies can require bounded global scans.

Preference writes and unsubscribe handling do not recreate consent after irreversible deletion. Recoverable opt-outs remain valid. Product updates default on for eligible members; weekly digests are separately opt-in. See [Community email](community-email.md).

## Inbox

Conversation lists use two participant-index pages, with an independently authorized selected-conversation summary. Messages are paginated. Conversation `messageSequence` and `readWatermarks`, plus message `sequence`, implement read receipts without rewriting message history. Optional fields preserve old records; legacy unsequenced messages precede new sequenced messages.

## Migrations

Keep optional compatibility fields until retained rows and pending jobs have been verified in each deployment. An outer backfill cursor ending does not establish that its queued per-user jobs finished. Preserve stored cursor query shapes during rollout and rollback. Follow [Operations](OPERATIONS.md) before removing schema or migration code.
