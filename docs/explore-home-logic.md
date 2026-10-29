# Discovery and Home

Explore, city pages, profiles, and Home share server-side visibility rules. The canonical implementations are in `convex/lib/visibility.ts`, `convex/lib/privacy.ts`, `convex/lib/snapshots.ts`, and the corresponding public functions.

## Location and discovery

`resolveLocationDisclosure` projects exact city, region only, or no location. Region labels remove text that would repeat the hidden city. `isCityMember` includes only exact-city users with a city; region-only and hidden users do not appear in city lists, counts, or map points.

`appearInExplore` controls discovery participation separately. Hidden-location users may still appear globally. Public identities omit emails, Clerk IDs, and private account statistics. Comments, Home actors, and other stored snapshots resolve current disclosure when read.

Profile/privacy changes commit user authority and builder city deltas immediately, then schedule indexed project/post synchronization through `startLifecycleOwnerSync`. Each bounded page commits copied fields, counters, progress, and continuation together. New generations supersede stale work. Reads enforce current privacy while project city counters and discovery indexes converge.

## Explore

`/explore` is public. URL state selects global or city scope, projects/builders/posts, language, topics, and collaboration filters. Selected-city results stay within that scope; empty cities offer an explicit route back to global discovery.

Project eligibility requires a visible project, active discoverable owner, and a profile city. Exact-city members can appear in city discovery; region-only and hidden-location owners can appear globally. Indexed pages use repository activity order; member stack matching affects presentation without expanding a page outside its selected scope.

Each feed execution reads one indexed page, filters visibility and selections, and preserves the cursor contract. An empty page with `isDone: false` means more pages may remain. It is not an empty-result verdict. Public Explore page sizes are clamped to 50.

Builder ordering uses `stats.lastPublicActivityAt` derived from public releases, posts, and visible repository pushes. New builders without that signal follow builders with public work. Followers, likes, comments, profile visits, and contribution-graph refreshes do not rank builders.

City search combines bounded normalized-prefix and full-text reads. Exact names and aliases precede prefixes and other full-text hits. Active builder/project counts and stable name tie-breaks order comparable candidates. The catalog has no population field in the runtime schema.

## City pages

`/c/$slug` shows a catalog city's counters, recent projects/posts, builders, and nearby active cities. Counts are maintained through `convex/lib/cityStats.ts`; reads do not aggregate the entire catalog. Nearby lookups use coarse indexed activity cells. No eligible content means an honest empty state, with nearby or global discovery as explicit alternatives.

## Home

Home contains activity from followed builders during the last 30 days. It does not inject unrelated discovery content. `HOME_FEED_RETENTION_MS` and `getHomeFeedCutoff` keep follow backfill, reads, and cleanup on the same boundary.

Activity writes schedule bounded fan-out into `home_feed_items`. Follow backfill upserts recent events with stable deduplication; re-following does not duplicate them. Unfollow removes that builder's materialized items. Reads resolve current actor disclosure and target visibility; retained unavailable targets cannot be opened.

For members following nobody, nearby-builder suggestions appear separately from the feed. Loading, no follows, quiet network, and loaded activity are distinct states. Read and cleanup paths use bounded pages.

## Profiles and social actions

Public profiles apply current profile/tab/graph/calendar visibility. Private contribution data is omitted from public payloads and hidden even if a client has a cached snapshot. Raw follow compatibility reads are self-only; public graph reads apply current privacy.

Saved projects are private to the viewer. Project reactions and comments require current authorization. Comment deep links page toward their target and scroll/highlight only after the target mounts, respecting reduced motion.

## Inbox and account changes

Inbox uses paginated participant lists, an authorized selected-conversation summary, and paginated messages. Read watermarks avoid lifetime-history rewrites. Draft and selected panels own identity keys so recipient switches and delayed sends cannot reuse another conversation's draft. History loads preserve the reader's scroll position.

Deleted/deactivated users are excluded according to current lifecycle authority. Restrictive changes take effect before copied state converges. See [Data model](Locatic_Database_Design.md) and [Operations](OPERATIONS.md) for resumable synchronization and purge compatibility.

Pulse is deprecated and unused. City pages provide local discovery. Legacy fields and snapshots remain for compatibility until an explicit migration retires them.
