# Explore and Home Logic

This document explains the intended behavior of Locatic's Explore and Home
feeds. It is a reference for humans and agents. Treat these rules as product
contracts, not incidental implementation details.

## Explore

Explore is city-filtered discovery for builders and projects.

### Scopes

Explore has three route-backed scopes. The scope and selected city IDs live in
the route search params so they survive refreshes, sharing, and back/forward
navigation.

- `default`: use the viewer's default Explore city context.
- `custom`: use the selected city chips in the URL.
- `global`: show projects everywhere and do not show a city-bound Nearby
  Builders rail.

Default city context resolves from `viewer.exploreConfig.cityIds` when present,
otherwise `viewer.profile.cityId`. Raw search text does not belong in the URL.

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

### Projects

Explore project results are loaded from `api.explore.list`.

The backend uses indexed project queries:

- Global project discovery uses `exploreOwner.isEligible`.
- City project discovery uses `exploreOwner.cityId` plus
  `exploreOwner.isEligible`.

Project eligibility requires:

- The project is visible.
- The owner is active.
- The owner appears in Explore.
- The owner has a city.

Explore excludes the viewer's own projects and dismissed projects before
ranking.

Ranking is implemented in `convex/lib/explore.ts`:

1. Build candidate rows from the indexed project query result.
2. Filter out owned and dismissed project IDs.
3. If selected city IDs exist, keep only candidates whose `cityId` is selected.
4. Build a case-insensitive stack preference set from
   `viewer.exploreConfig.stackPrefs`.
5. Add a `10` point stack boost when `primaryLanguage` matches a stack
   preference.
6. Compute popularity score as:
   `likesCount * 4 + commentsCount * 3 + stargazersCount + stackBoost`.
7. Compute freshness score as:
   `recentCommitBoost + commentsCount + likesCount + stackBoost`.
   The recent commit boost is `20` when `lastCommitAt` is within the last
   30 days.
8. Fill roughly 60% of the requested limit from the popularity sort.
9. Fill the remaining slots from the freshness sort, excluding projects already
   selected by popularity.
10. Return the combined popular-then-fresh list.

The project card `recommended` badge currently means "first ranked Explore card
in this response." It is not a persisted recommendation model, not a stable
score, and not a `matchPct` unless a future payload explicitly supplies that
field. Do not reuse this badge as proof of a recommendation engine without
adding explicit ranking metadata.

### Nearby Builders

Nearby Builders uses the active Explore city IDs, not always the profile city.
The query takes an explicit city ID array. An empty array means no city-bound
rail and must not fall back to profile city.

- `default`: use resolved default Explore city IDs.
- `custom`: use selected city chip IDs.
- `global`: use no city IDs.

The rail should show builder city metadata when available. This is deliberate:
it helps prove that the rail belongs to the selected city context.

Do not make the rail silently fall back to profile city when the active scope is
global.

Nearby Builder ranking:

1. Query eligible, active, non-deleted users per city through the
   `users.by_city_explore_rank` index.
2. Read top candidates per city ordered by follower count.
3. Merge and dedupe users across selected cities.
4. Exclude the viewer.
5. Final sort by `followersCount`, then `projectsCount`, then GitHub username.
6. Return at most eight builders.

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

Home feed lifecycle:

1. Product events are recorded as `activity_events`.
2. `fanOutActivityEventToFollowers` inserts one `home_feed_items` row for each
   follower of the actor.
3. Following a builder backfills recent activity from that builder into the
   viewer's Home feed.
4. Unfollowing a builder removes feed items whose actor is that builder.
5. The Home page reads `home_feed_items` by viewer and `createdAt` descending.
6. Where a project is still visible, Home joins the canonical project row at
   read time for current project-card data.

Home should answer: "What are people I follow doing?"

Explore should answer: "Who and what can I discover by city?"

Do not use Explore city filters to filter Home. If product later needs a
city-filtered activity feed, build it as a separate explicit mode with its own
copy, query keys, and tests.

## Do Not Change Casually

- Do not blend Home and Explore. Home is the viewer's network; Explore is city
  discovery.
- Do not make `global` Explore show Nearby Builders from profile city. That
  creates a hidden filter.
- Do not make city chips from raw strings. They must be backed by city docs.
- Do not key follow state by username. Follow relationships use user IDs.
- Do not treat the `recommended` badge as a stable ranking contract.

## Code Ownership

- Route orchestration: `src/routes/_app/explore.tsx`
- Explore pure state helpers: `src/features/explore/state.ts`
- Explore optimistic cache helpers: `src/features/explore/cache.ts`
- Explore UI components: `src/features/explore/components/`
- Convex Explore queries: `convex/explore.ts`
- Convex Explore ranking helpers: `convex/lib/explore.ts`
- Home fan-out helpers: `convex/lib/homeFeed.ts`

## Files To Check

- `src/routes/_app/explore.tsx`
- `src/features/explore/state.ts`
- `src/components/ui/city-combobox.tsx`
- `src/routes/_app/home.tsx`
- `src/routes/_app/settings.tsx`
- `convex/explore.ts`
- `convex/users.ts`
- `convex/lib/explore.ts`
- `convex/home.ts`
- `convex/lib/homeFeed.ts`
