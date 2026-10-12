# Explore and Home Logic

This document explains how Locatic's discovery surfaces (Explore, city pages,
the landing) and the Home feed behave, and the shared server rules under them.
It is a reference for humans and agents. Treat these rules as product
contracts, not incidental implementation details. Each rule names the
function that implements it; when this document and the code disagree, the
code wins and this document is wrong.

## Shared rules

### Location privacy (decision D8)

Every public surface that shows where a user is, or lists users or their work
by city, goes through `convex/lib/visibility.ts`:

- `resolveLocationDisclosure(user, city)` returns what a response may say:
  `{ kind: 'city', cityId, cityName, regionLabel }` for `exact_city`,
  `{ kind: 'region', regionLabel }` for `region_only` (region and country
  only, never the city), `{ kind: 'none' }` for `hidden` or a missing city.
  `getRegionLabel` drops a region or country that names the city: compared
  folded (lower case, no diacritics or punctuation), as whole words, so
  "State of Berlin", "Kyiv City" and "Buenos Aires F.D." are dropped and
  Berlin reads "Germany". When nothing is left (Singapore, Monaco, Hong Kong)
  the label is null and a region-only user discloses nothing.
- `isCityMember(user, cityId?)` is true only for `exact_city` users with a
  city. Region-only and hidden users are never members: they are absent from
  city lists, city counts, city feeds and map data.
- `getMemberCityId(user)` is the city a user counts for; it feeds
  `buildProjectExploreOwner` (`convex/lib/snapshots.ts`), so a project's
  `exploreOwner.cityId` is null unless its owner is a city member.
- `toPublicIdentity(user, cityById)` is the public projection used by every
  public payload: user id, display name, avatar, GitHub login, build status and
  the disclosure. No email, Clerk id or private stats.
- `toSnapshotLocation(disclosure)` is how stored owner and actor snapshots
  encode it: `cityId` only for members, `cityName` holding the region label
  for region-only users.
- `posts.projectCityId` (the city post indexes) is `getPostCityId(owner)`
  (`convex/lib/snapshots.ts`): the owner's member city only while the owner
  is discoverable (`isOwnerDiscoverable`, the rule behind
  `exploreOwner.isEligible`), else null. Discovery post reads (Explore feeds
  and search, city pages, `posts.search`) go through `filterDiscoverablePosts`
  (`convex/lib/posts.ts`), which also drops posts whose live owner is not
  discoverable and recomputes `projectCityId` and the actor's location from
  the live users. The project page and the profile use `filterVisiblePosts`,
  so an opted-out builder's posts stay public there. Posts stored before
  this rule keep their old `projectCityId` until
  `internal.users.backfillOwnerState` re-derives them; the read paths do not
  depend on that run.
- Stored snapshots that nothing re-derives are never served as stored:
  comment `authorSnapshot` locations (`comments.listRootsByTarget`,
  `comments.listReplies`), Home actors and Home profile targets resolve the
  user's current disclosure on read.

Discovery participation (`users.appearInExplore`) is a separate setting: it
decides whether a user appears in discovery at all, while the policy decides
what location they disclose. A hidden user can still appear in global
discovery. Privacy changes (`users.updatePrivacy`, `users.updateProfile`,
`users.updateExploreConfig`) re-derive the owner state on their projects,
posts and snapshots (`syncOwnedProjectOwnerState` in `convex/users.ts`) and
adjust the city counters in the same mutation, so the next read reflects them.
Read paths that could meet a row written before the latest change also check
the live owner.

Settings → privacy → "location and discovery" exposes both (defaults:
`exact_city`, `appearInExplore: true`): "where your city shows" (exact city,
region only, hidden) saves `cityVisibility` through `users.updatePrivacy`,
with each option saying what visitors see (the viewer's city label, their
region label from `privateProfileOverview.regionLabel`, or nothing); "appear
in explore and city pages" saves `appearInExplore` through
`users.updateExploreConfig`, keeping the stored Explore cities and stack
preferences. Both save on change; a failed save reports through
`reportActionError` with a retry and the control returns to the saved value.

### One `.paginate()` per execution (plan item A3)

A Convex function may call `.paginate()` once. Every paginated query here
reads one page from one index, filters that page (visibility, ownership,
dismissals, filters) and returns Convex's `page`, `isDone` and
`continueCursor` unchanged (`filterExplorePage` in `convex/lib/explore.ts`).
The Explore page helpers clamp the caller's `numItems` to 50
(`clampExplorePaginationOpts`), since the feeds are public and
`paginationOptsValidator` accepts any size.
A page can therefore be empty while `isDone` is false; the client treats that
as "more to load", never as "no results". Other reads are bounded `take`s on
an index.

### City counters (plan item A4)

`cities.stats` holds `builderCount`, `projectCount` and `lastActivityAt`,
maintained on write so no read path aggregates (`convex/lib/cityStats.ts`):

- `builderCount`: discoverable (`appearInExplore`, not deactivated or
  deleted) exact-city members of the city.
- `projectCount`: projects with `exploreOwner.isEligible` whose
  `exploreOwner.cityId` is the city.
- `lastActivityAt`: latest commit, live post or published release among the
  counted projects; a high-water mark raised on write, cleared when no project
  counts, made exact by a recount. Activity alone raises it only when it
  moves by at least an hour (`LAST_ACTIVITY_WRITE_STEP_MS`), so it can trail
  by up to an hour: every project card reads its owner's city document, and
  a write per post or push would re-run every subscribed query showing a card
  from that city. Counter changes write it exactly.

Writers collect per-city deltas with `createCityStatsChanges()` and apply them
once per city (`adjustCityStats`): `users.updateProfile` (city change),
`users.updatePrivacy`, `users.updateExploreConfig`,
`users.completeOnboarding`, `users.deactivateAccount`, account deletion and
scrub, the Clerk webhook upsert, `projects.updateVisibility` and
`projects.upsertImportedRepositories`. New activity raises `lastActivityAt`
through `recordProjectActivity` (`posts.create`,
`github.patchProjectMetadata`, `github.patchProjectReleases`). Missing
`stats` read as zero. `api.cities.getStats` is a single document read.

`internal.cities.recountStats` recomputes every touched city from its own
index ranges (`computeCityStats`), one page per run (25 source rows by
default, at most 50, so one run recounts at most that many distinct cities),
scheduling itself until done. A person runs it once per deployment after the schema deploy:
`npx convex run cities:recountStats '{}'` (add `--prod` for production).

## Explore

Explore is city-filtered discovery for builders, projects, and posts.

### Scopes

Explore has three route-backed scopes. The scope and selected city IDs live in
the route search params so they survive refreshes, sharing, and back/forward
navigation.

- `default`: use the viewer's default Explore city context.
- `custom`: use the selected city chips in the URL.
- `global`: show projects everywhere and do not show a city-bound Nearby
  Builders rail.

Default city context resolves from `viewer.exploreConfig.cityIds` when present,
otherwise `viewer.profile.cityId`. A signed-out visitor has no default cities,
so `default` reads everywhere for them. Raw search text does not belong in the
URL.

### Public Explore (signed out)

`/explore` is a public route (`src/routes/explore.tsx`, plan item C1).
Signed-out visitors browse projects, builders and posts, everywhere or by city,
and are never sent through sign-in. Members still get the app shell; a member
who has not finished onboarding is sent there first with the Explore URL as
the destination, as the `_app` guard does for other member routes.

Visitors read separate public queries with the same arguments, index reads
and one-`.paginate()`-per-execution rule as the member queries:

| Member query                     | Visitor query                          |
| -------------------------------- | -------------------------------------- |
| `api.explore.list`               | `api.explore.listPublic`               |
| `api.explore.listPosts`          | `api.explore.listPostsPublic`          |
| `api.explore.listNearbyBuilders` | `api.explore.listNearbyBuildersPublic` |

The public payloads are a reviewed field set, pinned by a key-set test in
`convex/explore.test.ts`:

- Projects: the public project card preview (`buildProjectCardPreview` with
  the public audience, validated by `projectCardPreviewValidator` from
  `convex/lib/project_previews.ts`). Explore feed rows include the card
  signals: `ownerLocation` (the owner's location disclosure, the source of
  the card's city link), `ownerBuildStatus`, `latestUpdate` (the most recent
  of the latest published release, the latest live post and the last
  repository push, with its kind and time) and `syncStatus` (metadata sync
  freshness: `fresh`, `stale`, `failed` or `never`, the last successful sync
  time and whether a README exists). A failed sync and its `error` are shown
  to the project owner only; everyone else sees the freshness of the last
  successful sync. No viewer state.
- Builders: public identity (`toPublicIdentity`, location through
  `resolveLocationDisclosure`) plus `projectsCount`, `followersCount` and
  `isNewBuilder` (account under 30 days old; a boolean, so the creation time
  itself is not exposed). Only builders whose `profileVisibility` is
  `public`; `locatic_only` profiles are for signed-in members.
- Posts: post content, counts, project snapshot and the actor's display name,
  avatar and location. The actor location is resolved from the live user
  under the visibility policy, not read from the stored snapshot. No search
  text, no `viewerHasLiked` or `viewerReactionTypes`.

For visitors, personal actions (like, react, save, follow, message, dismiss)
render as sign-in links whose `redirect` is the current Explore URL; no
mutation is reachable. Text search, "reset dismissed" and the stored Explore scope are
members-only: public Explore keeps its state in the URL and writes nothing to
session storage, so the shell's resume-Explore link (I5) only ever reflects a
member's own browsing.

Dismissal reads are bounded to the current candidate page or search window:
each candidate uses the `(user, project)` or `(user, post)` history index.
Resetting a large history clears 100 rows per internal mutation and schedules
continuations with the reset's timestamp as a cutoff, so later dismissals are
not accidentally cleared.

### City Chips

City chips are durable URL state, while raw search text is local component
state. Chips are never created from free-form strings. A chip must come from a
city document returned by Convex.

City selection is deduped in three layers:

- Convex ID dedupe for route search params.
- Canonical city dedupe once city documents are loaded.
- URL replacement when loaded city docs prove the route contains semantic
  duplicates.

Canonical city identity uses this priority:

1. `slug`
2. `normalizedName`
3. `displayName`
4. Convex `_id`

When a user removes a city chip, all selected IDs with the same canonical city
identity are removed. This prevents the UI from hiding duplicates while the URL
still carries duplicate filters.

### City Autocomplete

The city autocomplete only shows results after the user types. Empty focus does
not open popular suggestions.

The component is an editable combobox:

- The input has `role="combobox"`.
- The popup has `role="listbox"`.
- Results have `role="option"`.
- Focus remains on the input while `aria-activedescendant` points at the active
  option. It must only point at an option that is currently rendered.
- Escape closes the popup.
- Arrow keys move the active option only when the user has typed a query.
- Enter selects the active option.

Keep option rows touch-friendly at a minimum 44px height.

### City search (plan item B10)

`api.cities.search` ranks with `searchCities` (`convex/lib/citySearch.ts`).
Candidates come from two bounded reads: a prefix range on `normalizedName`
over active cities (at most `PREFIX_READ_BUDGET`, 96 rows) and one page of the
`search_text` full-text index (`limit × 4` rows). Each candidate falls in one
tier: exact name, exact alias ("nyc", "bangalore"), name prefix ("ber" →
Bern, Berlin), alias prefix, then any other full-text hit. Within the prefix
and full-text tiers, cities with more Locatic builders, then more projects
(A4 counters), come first; then shorter name and alphabetical order, so the
order is stable. The catalogue has no population field, so nothing is
weighted by population. Options show region and country so two cities with
one name stay distinguishable. Default limit 8, maximum 20.

### Projects

Explore project results are loaded from `api.explore.list`.

The backend uses indexed project queries:

- Global project discovery uses `exploreOwner.isEligible`.
- City project discovery uses `exploreOwner.cityId` plus
  `exploreOwner.isEligible`.

Project eligibility (`exploreOwner.isEligible`, derived by
`buildProjectExploreOwner` whenever the project or its owner changes)
requires:

- The project is visible.
- The owner is active (not deactivated or deleted).
- The owner appears in Explore.
- The owner has a profile city.

`exploreOwner.cityId` is set only when the owner is an exact-city member, so a
region-only or hidden owner's projects are eligible for global Explore but are
never in a city's feed. Global reads use
`projects.by_explore_eligible_last_commit`; one selected city uses
`projects.by_explore_city_last_commit`.

Each call reads one page from the index ordered by `github.lastCommitAt`
(newest first), then filters and orders that page (`convex/explore.ts`,
helpers in `convex/lib/explore.ts`):

1. Drop the viewer's own projects and dismissed projects.
2. With several selected cities, keep rows whose `exploreOwner.cityId` is
   selected; with any city scope, keep rows whose live owner is still an
   exact-city member of a selected city.
3. Within the page, projects matching the viewer's stack preferences
   (`exploreConfig.stackPrefs`, compared case-insensitively against the
   primary language, other languages and canonical topics) come first; ties
   keep the most recent commit first (`rankExploreProjectsByStack`). Visitors
   have no stack preferences.

A page can filter down to nothing while `isDone` is false; the client then
fetches on its own for a bounded number of pages before offering "keep
looking" (plan item A3).

The dismissal check is one indexed point lookup per candidate in this bounded
page; it never loads the viewer's lifetime dismissal history.

The feed heading states the order in plain words: "most recent public work
first; projects matching your stack first" for members, "most recent public
work first" for visitors (who have no stack preferences). No percentages and
no "recommended" framing.

#### Language and topic filters (plan item D2)

Two optional URL search params narrow the projects feed. They are validated
in `normalizeExploreSearch` (`src/features/explore/state.ts`), present only
when set, shown as removable chips in the header band, and therefore
shareable and reload-safe:

- `language` matches `github.primaryLanguage` only (the chip reads "primary
  language"), compared after the stack-preference normalisation
  (`normalizeExploreLanguage` in `convex/lib/explore.ts`: trimmed, case
  insensitive). Secondary languages do not match.
- `topic` matches the canonical topics from `getProjectTopics`
  (`convex/lib/topics.ts`): edited Locatic tags when present, otherwise
  GitHub topics, both through `normalizeProjectTopics`. A project whose tags
  were edited is found by its tag, not by the GitHub topic the tags replaced.
  The URL keeps the topic in the same normalised form
  (`normalizeProjectTopic`), so the chip shows it as cards do.

City scope, eligibility (visibility, ownership, dismissal), language and topic
are all ANDed. The viewer's own projects appended in a selected city (C2) are
filtered too. Text search results (`api.explore.searchProjects`, one bounded
query without filter arguments) are filtered on the client with the same
rule. Filters exhausted with nothing to show read "no projects match these
filters." with a "clear filters" action, ahead of the empty-city state.

Continuation and bounds: `api.explore.list` and `api.explore.listPublic`
still run one `.paginate()` per execution and filter the returned page. A
page that filters to zero with continuation left is never "no results": the
client fetches up to `EXPLORE_AUTO_FETCH_LIMIT` (3) further pages of
`EXPLORE_PAGINATED_PAGE_SIZE` (20) on its own, at most 60 automatic rows and
one round trip per page, then shows "keep looking". Only `isDone: true`
produces the empty state. `convex/explore.test.ts` drives the real client
state machine against deliberately uneven fixtures to prove this (common
language, rare topic past three empty pages, combined filters, exhaustion).

Index or page filter (decision): both are page filters; no index was added.
On the uneven fixture a common primary language (TypeScript on most rows)
fills the first 20-row page, so page filtering is not too sparse for common
languages. Topics are an array and no Convex index matches array membership;
a rare topic ends in "keep looking" within the read budget above. Revisit
with production data: a common-language filter that often needs "keep
looking" would justify adding `github.primaryLanguage` as an equality field
to the `by_explore_*_last_commit` indexes, and a sparse topic a denormalised
topic-key table populated from `getProjectTopics` on write. Either is a
schema change decided separately.

#### Own projects (exclusion contract)

The viewer's own projects are never ranked among recommendations. Since plan
item C2 there is one exception to the old "Explore never shows your own
projects" rule: in an explicitly selected city (`custom` scope), the page that
ends the feed (`isDone`) appends the viewer's own eligible projects in the
selected cities, newest commit first, marked `isViewerProject: true` and
labelled "yours" in the UI. They are read with one bounded `take` from the
viewer's `by_owner_visible` index (at most `VIEWER_CITY_PROJECT_LIMIT`, 10),
only when the viewer is an exact-city member of a selected city. `default`
and `global` scopes still exclude own projects entirely. The field exists only
on the member payload.

#### Empty selected city

When exactly one city is explicitly selected and a browse feed is exhausted
with nothing to show, Explore names the city ("no projects in Mysuru yet.")
and shows "N builders here" from `api.cities.getStats` (maintained counters,
plan item A4). It offers "browse everywhere" (switches to `global` scope on
click) and "choose another city" (focuses the city combobox), and lists up to
five of the city's builders from one page of the nearby-builders query. The
scope never changes without a click.

Explore does not show a `recommended` badge. The ranked order is only a feed
ordering signal, not a user-facing recommendation model or match percentage.
Do not add recommendation copy without explicit ranking metadata that explains
why an item was selected.

### Posts

Explore post browsing is a first-class mode, not only a text-search surface.
When the post search input is empty, Explore loads recent posts for the active
scope:

- `default`: posts from the resolved default Explore city context.
- `custom`: posts from the selected city chips in the URL.
- `global`: posts everywhere.

The backend query for post browsing is `api.explore.listPosts`. It uses normal
post indexes, not the text-search index:

- Global browsing uses `posts.by_deleted_created`.
- One selected city uses `posts.by_city_deleted_created`; several cities read
  the global index and keep posts whose project city is selected.

The query returns newest discoverable posts (`filterDiscoverablePosts`:
visible project, owner active and in discovery, project city from the live
owner), excludes dismissed posts through `explore_post_history`, and applies
the same checks as post search. A builder with `appearInExplore: false`
never appears here, in post search or on city pages, including through a
stored `projectCityId` written before they opted out. Text search remains separate in `api.explore.searchPosts` and only
runs when the search input has a non-empty debounced query.

As with projects, post dismissal state is read only for the bounded page or
bounded search candidate set through `by_user_post`.

### Nearby Builders

Nearby Builders uses the active Explore city IDs, not always the profile city.
The query takes an explicit city ID array. An empty array means no city-bound
rail and must not fall back to profile city.

- `default`: use resolved default Explore city IDs.
- `custom`: use selected city chip IDs.
- `global`: use no city IDs.

Builder rows show the builder's disclosed location (a city link, a region
label or nothing), which shows that the list belongs to the selected city.

Do not make the rail silently fall back to profile city when the active scope is
global.

#### Builder ranking: most recent public work first (plan item D4)

Builders are ordered by their most recent publicly visible work, not by
follower count. The signal is `users.stats.lastPublicActivityAt`:

```text
max(latest published release, latest live post, latest commit)
```

across the builder's visible projects (`locatic.isVisible`). Likes, reactions,
comments, follows and profile visits are not activity. Owner-level
discoverability (`appearInExplore`, city, deactivation) is not folded into the
value; the ranking indexes and the page filter gate on it.

Order:

1. Builders with a value, newest first, read from
   `users.by_city_public_activity` (`appearInExplore`, `profile.cityId`,
   `stats.lastPublicActivityAt`) for one city or `users.by_public_activity`
   for several cities or everywhere.
2. Builders with no public work (field unset) after them, newest account
   first (`createdAt` descending), so a new builder is visible before they
   ship. Accounts younger than 30 days carry a "new builder" label
   (`isNewBuilder` in `src/lib/builder-activity.ts`).

The page drops the viewer, and city-scoped lists keep exact-city members of
the selected cities only (visibility policy D8). The query itself lives in
`convex/explore.ts` (nearby builders); user-facing copy explains the order as
"most recent public work first". City pages (`readCityBuilders` in
`convex/cities.ts`) and the builder suggestions
(`users.suggestOnboardingBuilders`, used by onboarding and Home) read the same
index in the same order.

Maintenance (`convex/lib/activity.ts`):

- Raised on write, never lowered, by the paths that create work:
  `posts.create`, release import (`github.patchProjectReleases`), metadata
  refresh (`github.patchProjectMetadata`), repository import
  (`projects.upsertImportedRepositories`) and a project turning visible.
  Only visible projects count; a timestamp ahead of the server clock is
  clamped to now.
- Recomputed exactly when work stops being public and could have been the
  latest: a project turning hidden (`projects.updateVisibility`), a post being
  deleted (`posts.remove`) and account purge (cleared).
- The hourly `refreshActiveProjectMetadata` cron refreshes a bounded batch
  (explicit `limit`, default 25, capped at 100). It reads the
  `4 × limit` visible projects least recently attempted and refreshes projects
  that are visible in discovery (`exploreOwner.isEligible`) first; a fifth of
  each batch goes to the stalest rows regardless, so profile-only projects are
  never starved.
- `syncContributions` (the GitHub contribution graph fetched on a profile
  visit) writes only `githubContributions` and `updatedAt`; neither is a
  ranking input.
- `internal.users.backfillLastPublicActivity` recomputes every user, one page
  per run, scheduling itself until done. Run it once after the schema deploy:
  `npx convex run users:backfillLastPublicActivity '{}'` (add `--prod` for
  production). A recompute reads up to 50 visible projects per user plus two
  indexed reads per project; a run handles 5 users (at most 10).

Query shape (`listNearbyBuilderPage` in `convex/explore.ts`): one
`.paginate()` per execution over the index, read descending. Convex sorts a
missing field before every number, so in descending order builders without
the signal come after every active builder, and ties keep insertion order,
newest first; users are inserted with `createdAt` set to the insertion time,
so that is newest account first. One index read per page therefore covers
both groups. Neither index holds `deletedAt` or `deactivatedAt`; those are
page filters.

#### Open to collab (plan item D3)

In builders mode the "open to collab" chip sets `openToCollab=true` in the
URL and keeps builders whose `profile.buildStatus` invites someone in:
`open_to_collab`, `looking_for_cofounder` or `hiring`
(`COLLABORATION_BUILD_STATUSES` in `convex/lib/explore.ts`, matching
`isCollaborationStatus` in `src/components/ui/status-pill.tsx`). It is a page
filter with the same continuation rules as the project filters; no new
field. Builder rows show those statuses with `StatusPill`, as project cards
and profile headers do.

### City links

A disclosed exact city renders as a `CityPill` link to the city page,
`/c/{cityId}` (`src/components/ui/city-pill.tsx`); the page redirects to the
city's slug (see City Pages), because location payloads carry the city id,
not the slug. A region-only label is plain text and a hidden location renders
nothing (`LocationPill` maps the `location` union). Builder rows, person rows
(`PersonRow` `location` prop) and Home feed rows use it; project cards pass
the owner's city id when their preview carries one. City-filtered Explore is
one click further, from the city page's "more in explore" links.

### Follow And Like State

Follow state is keyed by user ID. Do not compare a follow graph of user IDs
against GitHub usernames or display handles.

Explore project card follow state uses `project.ownerUserId`.

Nearby builder follow state uses `builder.userId`.

After follow/unfollow, invalidate:

- The viewer following query.
- The active Explore feed query.
- The active Nearby Builders query.

Like state is keyed by project ID and should update both the active feed cache
and `viewerLikedProjectIds`.

## City Pages

`/c/$slug` (`src/routes/c.$slug.tsx`, plan item D5) is a public page for one
catalogue city. It takes over the local-discovery value of Pulse: recent
work, builders and posts for a place, with no ranks, scores or leaderboards.

- Address: the city's `slug`, or its id (city pills link by id). An id
  redirects to the slug. An unknown slug or an inactive catalogue entry
  (`isActive: false`) is a real 404 with an h1 and a link to Explore.
- An active city always renders a normal page, empty or not: name, region
  and country, and the A4 counters as "N builders, M projects" ("0 builders,
  0 projects" when empty). Counts include builders with members-only
  profiles; the builders list below does not, so the list can be shorter.
- Visitors and members read the same public payload; members get the app
  shell, and members who still need onboarding go there first, as on
  Explore.

One query, `api.cities.getPage({ slug })`, loads the page in the SSR loader.
Every read is indexed and bounded (a convex-test contract records the reads
and fails on `.collect()`, an unindexed query, a second `.paginate()` or a
cell outside the neighbourhood):

| Section      | Read                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| City         | `cities.by_slug` (or the id), then its stored `stats`                                                                                                 |
| Recent work  | one `.paginate()` of 12 on `projects.by_explore_city_last_commit`, newest commit first; live owner must still be a discoverable member of the city    |
| Builders     | one `take(36)` on `users.by_city_public_activity`, descending (D4 order); exact-city members with public profiles only, up to 12                      |
| Recent posts | one `take(18)` on `posts.by_city_deleted_created`, then the discovery post checks (`filterDiscoverablePosts`) and the project's current city, up to 6 |
| Nearby       | `cities.by_activity_cell` for the city's cell and its eight neighbours, `take(20)` each, ranked by great-circle distance, top 5                       |

Payloads go through the visibility policy (`toPublicIdentity`, public
project cards with `audience: 'public'`); no email, Clerk id, viewer state or
private stat. A member who turns hidden or region-only drops out of the
counters on that write (A4) and out of builders, recent work and posts on the
next read.

### Empty city and nearby cities

When recent work, builders and posts are all empty, the page names the city
("no public work in Mysuru yet.") and offers, in order:

1. Nearby catalogue cities with public activity, closest first, each with its
   A4 counts and distance.
2. When there are none, "browse everywhere" (global Explore).

Nearby lookup never scans the catalogue. `cities.activityCell` holds a coarse
2-degree cell key (`getActivityCellKey` in `convex/lib/geo.ts`) only while
the city's `builderCount` or `projectCount` is above zero; the counter writes
in `convex/lib/cityStats.ts` (`adjustCityStats`, `recountCityStats`) set and
remove it with the counts. `readNearbyActiveCities` reads the city's cell and
its eight neighbours by index (about 220 to 440 km north-south, narrower
east-west towards the poles) and ranks the candidates by distance. Because
the counters exclude hidden and region-only users, so do the suggestions and
the map. A cell with more than 20 active cities contributes an arbitrary 20.

The same nearby cities appear once as the map and once as a list: `DotMap`
with `points` (nearby cities) and `focus` (this city), snapped to the land
mask by an equirectangular projection, labelled for assistive technology,
with the list of links beside it. A populated city shows them in a "nearby
cities" section; an empty one shows them as its suggestion.

After deploying the schema, run the counter recount once so existing active
cities get a cell: `npx convex run cities:recountStats '{}'` (add `--prod`
for production). Cities also gain or lose a cell on their next counter
change.

## Profile City Sync

Profile city and Explore defaults are related, but not identical.

Chosen rule: sync if default.

When a user changes profile city:

- If `exploreConfig.cityIds` is empty, set it to the new profile city.
- If `exploreConfig.cityIds` contains exactly the old profile city, replace it
  with the new profile city.
- If `exploreConfig.cityIds` contains explicit custom cities, preserve it.
- If the new profile city is cleared and Explore was profile-derived, clear the
  Explore city defaults.

This preserves explicit custom discovery preferences while fixing the common
case where Explore was only following the old profile city.

## Home

Home is not city-scoped. Do not change this casually.

Home is a following feed built from `home_feed_items`, a fan-out read model. It
does not query "projects in my city" and it does not read Explore filters.

### Delivery

1. Product events are recorded as `activity_events`.
2. `enqueueActivityEventFanOut` schedules `internal.home.fanOutActivityEventBatch`,
   which runs `fanOutActivityEventToFollowersPage` (`convex/lib/homeFeed.ts`)
   over the actor's followers, 100 follows per page, and upserts a
   `home_feed_items` row per follower with `upsertHomeFeedItemForEvent`. The
   dedupe key `${followerId}:${eventId}` makes a retried fan-out a no-op.
3. `follows.follow` runs `backfillHomeFeedForFollow`: the followed builder's
   latest 20 events newer than the Home boundary
   (`activity_events.by_actor_created_at`), through the same upsert and dedupe
   key, so re-following does not duplicate. The events are upserted one at a
   time, oldest first: several can land in the same group row, and a
   concurrent read-then-insert would create duplicate group rows.
4. `follows.unfollow` runs `removeHomeFeedItemsForFollow`, removing the
   follower's items whose actor is that builder.
5. `api.home.list` reads the viewer's `home_feed_items.by_user_created` range
   newer than the boundary, newest first, with one `.paginate()`.
6. The read joins live data: a current project preview while the project is
   still visible, else the stored snapshot with `isOpenable: false` (the same
   for a profile target whose user left), and the actor's current location
   disclosure and GitHub login, so rows link the actor and show the city pill
   under the privacy policy whatever the stored snapshot says. A profile
   target carries the profile user's current `cityId`/`cityName` the same
   way, and no location once the user has left.

### One 30-day boundary (plan item C5, decision D12)

`HOME_FEED_RETENTION_MS` (30 days) and `getHomeFeedCutoff(now)` in
`convex/lib/homeFeed.ts` govern three places: follow backfill skips older
events, `home.list` reads only newer items, and `cleanup.runDailyCleanup`
deletes older items. An item is therefore never shown that the next cleanup
would delete. The client copy reads the same interval from
`HOME_FEED_WINDOW_DAYS` (`src/features/home/render-state.ts`), and a test keeps
the two equal.

Other retention in `runDailyCleanup`: `activity_events` 90 days;
notifications 7 days once read and 90 days in any case. Each runs in batches
of 100 and the job reschedules itself until a batch comes back short.

### States

`getHomeFeedState` (`src/features/home/render-state.ts`) returns one of:

- `loading`: first page loading.
- `noFollows`: "you're not following anyone yet." with "go to explore", and
  below it a separate "builders near you" section ("suggestions, not part of
  your feed.") from `api.users.suggestOnboardingBuilders` for the viewer's
  city: up to 5 exact-city members, each with a follow toggle confirmed by an
  undo toast. Members without a city see no suggestions. The suggestions are
  one bounded read (`take(25)`) of `users.by_city_public_activity` in the D4
  order ("most recent public work first", shown above the list), with the
  "new builder" label.
- `quiet30d`: "nothing from the N people you follow in the last 30 days."
- `ready`: the feed.
- `error`: rendered by the route's error boundary, with retry.

### Grouping

Home groups activity in the read model, not in React. V1 grouping is same actor
only and uses a UTC same-day bucket so writes do not depend on client timezone.
The UI may still describe the latest event as today, yesterday, or older from
the viewer's browser clock.

Grouping rules:

- `project_commented`: same actor, same project, same UTC day.
- `post_commented`: same actor, same post, same UTC day.
- `post_created`: same actor, same project, same UTC day.
- `project_liked`: same actor, same event family, same UTC day.
- `followed`: same actor, same event family, same UTC day.
- `project_posted`: same actor, same event family, same UTC day.
- `contributor_matched`: same actor, same project, same UTC day.

Feed rows carry a `target` and capped `previewTargets` array. Cards show at most
three preview rows while collapsed and expand multi-target rows to at most ten
stored previews. `eventCount` remains the source of truth for the total count,
so cards can show `+N more` when a same-day group has more events than previews.
Comment targets also carry root/ancestor comment ids so Home uses the same
deep-link contract as profile comment navigation. Grouped rows keep a bounded
recent source-event id list for dedupe; `eventCount` is the durable total.

Legacy Home rows created before grouping may only have `sourceEventId`,
project ids, and snapshots. The internal grouped-feed backfill rebuilds those
rows from `activity_events`, merges them through the same grouped upsert helper
used by new writes, and then deletes the old ungrouped row. It should be run in
small dry-run/resumable batches. Rows older than the 30-day Home boundary are
intentionally not rebuilt.

### Surfaces answer different questions

Home should answer: "What are people I follow doing?"

Explore should answer: "Who and what can I discover by city?"

Do not use Explore city filters to filter Home. If product later needs a
city-filtered activity feed, build it as a separate explicit mode with its own
copy, query keys, and tests.

## Onboarding follow step

After the repository step, onboarding offers builders in the chosen city
(decision D7) from the same `api.users.suggestOnboardingBuilders` query:
exact-city members only, never the viewer, public identity only, at most 5,
most recent public work first (D4). Builders the viewer already follows stay
in the list with `viewerIsFollowing` set, so a row never disappears under the
viewer's own click. The step exists only when the query returns at least one
builder
(`getOnboardingSteps` in `src/features/onboarding/steps.ts`); nothing is
followed without a click. Onboarding then goes to the validated `redirect`
destination, else to Explore (the chosen city is saved as the default Explore
city, so plain `/explore` opens on it).

## Saves (plan item D1)

A private bookmark list: `saved_projects` rows (`userId`, `projectId`,
`createdAt`) with `by_user_created` and `by_user_project` indexes. No folders,
tags or sharing.

- `projects.save`: requires sign-in and a publicly interactable project;
  idempotent (saving a saved project changes nothing and is not counted).
- `projects.unsave`: idempotent and works on projects that have since been
  hidden, so a user can always clear their own rows. Undo re-saves, which
  creates a new row and moves the project to the top of Saved.
- `projects.listSaved`: one `.paginate()` over the viewer's own
  `by_user_created` range, newest save first. Saves of hidden projects, or
  projects whose owner left, are skipped (a page can be short) but kept, so
  the save returns if the project becomes visible again. No other user's rows
  are reachable.
- `projects.getSavedState`: which of up to 40 given projects the viewer has
  saved, one indexed point read each; empty for visitors.

The list is the `/saved` route. Account scrub deletes the user's saves.

## Inbox and notifications (plan item C9)

Conversation status for the viewer (`getConversationStatus` in
`convex/conversations.ts`): `active` once accepted; while `isRequest` holds,
`pending` when the viewer sent the last message (their outgoing request) and
`request` otherwise (an incoming one). `isRequest` stays true only while
every message came from the person who started the conversation; the
recipient's first reply clears it. The Requests tab lists `request` only;
`pending` conversations sit in the main list with a "pending" label
(`src/features/inbox/navigation.ts`). There is no Sent tab.

Badges: the inbox badge is `users.unreadMessagesCount`. The notifications
badge is `api.notifications.unreadCount`, one query shared by the sidebar,
the tab bar and the notifications header, reading at most 100 unread rows
(shown as "99+"). A direct message is counted once, by the inbox badge:
`dm_received` notifications are created read (`createNotificationIfEnabled`),
so they appear in the notifications list but never count, and reading a
conversation touches no notification. The badge query still skips unread
`dm_received` rows written before that change; retention deletes them.

`api.notifications.list` is read-only: one `.paginate()`, with targets of old
rows resolved at read time. Storing them is the job of the one-off
`internal.notifications.backfillTargets` migration (pages of 200, scheduling
itself), which a person runs once per deployment:
`npx convex run notifications:backfillTargets '{}'`. Viewing notifications
runs no mutation; `markRead` and `markAllRead` run only on explicit clicks.

## Landing (plan item D7)

The landing reads two public, viewer-independent queries:

- `api.cities.listActiveForMap` (`readActiveMapCities`): one
  `cities.by_activity_cell` read, `take(200)`, keeping active cities with
  `builderCount > 0`, most builders first. City-level fields only (slug,
  name, coordinates, builder count); no user appears in the payload. With more
  than 200 active cities the map shows an arbitrary 200.
- `api.landing.listRecentActivity`: the newest posts
  (`posts.by_deleted_created`), published releases
  (`project_releases.by_published`), shared projects
  (`projects.by_explore_eligible_added`) and pushed projects
  (`projects.by_explore_eligible_last_commit`), read lazily and merged newest
  first, plus cached project, owner and city reads. A project is one item:
  shipped at `lastCommitAt` when pushed after it was shared, else shared at
  `addedToLocaticAt`. Keeps visible projects of active, discoverable owners
  who disclose an exact city (region-only and hidden-city builders never
  appear), at most two per builder, up to 12. Skipped rows do not end the
  scan; it stops at 12 items or after 400 index rows. Each item carries its
  city's coordinates and links to its project, post (`?post=`) or release
  (`?release=`).

The globe's city dots and caption use only the map cities that appear in that
activity (`getCitiesWithActivity`): a builder with no projects counts toward a
city's `builderCount` but gives it nothing to ping, so it gets no dot.

## Do Not Change Casually

- Do not blend Home and Explore. Home is the viewer's network; Explore is city
  discovery.
- Do not make `global` Explore show Nearby Builders from profile city. That
  creates a hidden filter.
- Do not make city chips from raw strings. They must be backed by city docs.
- Do not key follow state by username. Follow relationships use user IDs.
- Do not describe Explore ranking as a recommendation engine unless explicit
  ranking metadata is available.
- Do not rank people by follower count, likes or profile visits, and do not
  show numbered ranks.
- Do not compute counts or city membership on read or on the client; use the
  A4 counters and `convex/lib/visibility.ts`.

## Code Ownership

- Route orchestration: `src/routes/explore.tsx` (public route; members get
  the app shell)
- Explore pure state helpers: `src/features/explore/state.ts`
- Explore UI components: `src/features/explore/components/`
- Convex Explore queries: `convex/explore.ts`
- Convex Explore ranking helpers: `convex/lib/explore.ts`
- Home fan-out helpers: `convex/lib/homeFeed.ts`
- Location privacy: `convex/lib/visibility.ts`
- City counters and nearby cells: `convex/lib/cityStats.ts`,
  `convex/lib/geo.ts`
- City search ranking: `convex/lib/citySearch.ts`
- Builder activity signal: `convex/lib/activity.ts`
- Saves: `convex/projects.ts` (saves section), `src/routes/_app/saved.tsx`
- City pages: `src/routes/c.$slug.tsx`, `src/features/city/`,
  `api.cities.getPage` in `convex/cities.ts`, nearby cells in
  `convex/lib/cityStats.ts` and `convex/lib/geo.ts`

## Files To Check

- `src/routes/explore.tsx`
- `src/features/explore/state.ts`
- `src/components/ui/city-combobox.tsx`
- `src/routes/_app/home.tsx`
- `src/routes/_app/settings.tsx`
- `convex/explore.ts`
- `convex/users.ts`
- `convex/lib/explore.ts`
- `convex/home.ts`
- `convex/lib/homeFeed.ts`
- `convex/cleanup.ts`
- `convex/lib/visibility.ts`
- `convex/lib/cityStats.ts`
- `convex/cities.ts`

## Pulse (retired)

Pulse is retired (decision D1). The hourly rebuild cron was removed first
(plan item A0), after a code sweep found no consumer that needed fresh
snapshots. Plan item E2 then removed the rest of the code path: the
`pulse.listPublic` query, the `rebuildSnapshots` internal mutation, the
`pulseQueryOptions` client helper and the unrendered Home rail
(`src/features/home/home-rail.tsx`). City pages carry local discovery and
read nothing from Pulse.

Kept on purpose: the `pulse_snapshots` table and its rows (no data deletion in
this pass), the `privacy.appearInPulse` field (still stored and accepted by `users.updatePrivacy`; nothing reads it for behaviour) and the
one-off `projects.backfillRouteFields`, which reads snapshots only to fill
missing `ownerLogin` values. `convex/pulse.ts` is an empty module and
`convex/lib/pulse.ts` is unused; both stay only because the generated
`convex/_generated/api.d.ts` imports them, and go together with a
`npx convex codegen` run.

Follow-up (not done yet): after deployment, compare like-for-like database I/O
and function-call windows (two days as an initial window), taking traffic,
dataset size and concurrently shipped changes into account. Record the result
as an observed difference; do not attribute a saving to Pulse without
function-level evidence.
