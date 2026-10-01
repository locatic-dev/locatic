# Metrics

What Locatic counts, where the numbers live, and how to read cost next to them (plan item E4, technical decision T7). Counts are daily totals. Nothing is recorded per user or per page view.

## Daily counters

Each counted action adds 1 to a row in the `metrics_daily` table (`convex/schema.ts`), keyed by UTC day (`YYYY-MM-DD`) and metric key. Code: `convex/metrics.ts` on the server, `src/integrations/convex/metrics.ts` on the client.

| Key                        | Counted when                                                                                                                                                                             | Where                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `follow`                   | A follow is created. Following someone you already follow is not counted.                                                                                                                | `follows.follow`                                                                        |
| `save`                     | A project is saved. Saving an already-saved project is not counted; undoing an unsave counts again.                                                                                      | `projects.save`                                                                         |
| `comment`                  | A comment or reply is posted on a project or a repo post.                                                                                                                                | `comments.create`                                                                       |
| `dm_open`                  | A first message starts a new conversation. Later messages, and first messages into an existing conversation, are not counted.                                                            | `conversations.sendFirstMessage`                                                        |
| `empty_state_action`       | A signed-in person clicks an action on an Explore or Home empty state (browse everywhere, choose another city, clear filters, clear city filters, reset dismissed, go to explore).       | `explore-feed.tsx`, `home-feed-status.tsx`, reported through `metrics.record`           |
| `discovery_sign_in_return` | Someone signs in (or signs up and finishes onboarding) from a public discovery page (`/explore`, `/u/…`, `/c/…`, `/project/…`) and lands back on that page signed in, within 30 minutes. | Sign-in page remembers the destination for the tab; the root counts it once on arrival. |

Server counters are scheduled from the mutation that performs the action (`countMetric`), so they commit only if the action commits and never add a write conflict to it. Client counters go through the public `metrics.record` mutation, which accepts only the two client keys and ignores signed-out callers. Visitors' empty-state clicks are therefore not counted, and a signed-in person could inflate a client counter by hand; treat client counts as indicative.

### Reading the counters

In the Convex dashboard, open **Data → metrics_daily** and filter by `day`, or run a query in the dashboard's function runner against the `by_day_key` index. Useful ratios:

- **Discovery journey completion:** `discovery_sign_in_return` per day. Compare it with sign-ups in Clerk for the same days.
- **Action success:** `follow`, `save`, `comment` and `dm_open` per day. Failed attempts are not counted; failures reach the user as toasts (`src/lib/action-error.ts`).
- **Empty-state recovery:** `empty_state_action` per day, read against how often those empty states appear (not counted, by design: no per-view writes).

## Cost per operation

Convex reports cost per function, not per product action. In the dashboard, open **Usage** and use the function breakdown for a chosen period:

1. Note calls, database bandwidth (I/O) and, for actions, compute for the function behind the action: `follows:follow`, `projects:save`, `comments:create`, `conversations:sendFirstMessage`.
2. Divide by that period's counter total for the matching key. For example, `follows:follow` database bandwidth ÷ `follow` count ≈ bandwidth per successful follow.
3. Add the scheduled work each action triggers: a follow and a comment each schedule Home fan-out (`home:fanOutActivityEventBatch`) and one `metrics:increment`.

The ratio slightly overstates per-success cost, because the function totals include failed and no-op calls (for example, a repeated follow).

## Idle background cost per day

Background work that runs with no traffic comes from the crons in `convex/crons.ts`:

| Job                                            | Schedule        | Bounded by                                                           |
| ---------------------------------------------- | --------------- | -------------------------------------------------------------------- |
| `cities:seedDefaultCities`                     | daily           | one indexed lookup per default city                                  |
| `reactions:seedDefaultReactions`               | daily           | the small `reaction_config` table                                    |
| `github_actions:refreshActiveProjectMetadata`  | hourly          | `limit: 25` projects, plus GitHub API calls from the action          |
| `github_actions:refreshDueProjectContributors` | every six hours | `limit: 20` projects                                                 |
| `cleanup:runDailyCleanup`                      | daily           | batches of 100 expired Home items, notifications and activity events |

To measure idle cost, pick a day with little traffic and read the function breakdown for these five functions only (plus the internal mutations they call, such as `github:patchProjectMetadata`). Their daily sum is the idle background cost. The Pulse rebuild is no longer scheduled (plan item A0); do not attribute any saving to it without a before-and-after comparison of like-for-like days.

## Guardrails that protect these numbers

- `pnpm check:collect` (`scripts/check-collect-calls.mjs`) reports `.collect()` calls outside internal migrations and fails on new ones, so request paths keep bounded reads.
- Counters never store user ids. Adding a key means adding it to the validators in `convex/metrics.ts` and to the table above.
