# Product

## Register

product

## Users

Developers with active side projects who want visibility for their work without self-promotion overhead. They live in GitHub, build things regularly, and want to know what people nearby are shipping. Secondary audience: curious developers discovering new projects, potential collaborators, and indie hackers looking for interesting builders to follow or DM.

Primary context: authenticated desktop app (coding session breaks, morning feed check), secondary context: mobile on the go (quick notification check, follow/like actions while commuting). Signed-out visitors can browse Explore, city pages, profiles and projects read-only.

Job to be done: discover what builders near me are working on right now. Secondary job: be discoverable to people who would find my work interesting.

## Product Purpose

Locatic is "GitHub with a map" — a developer discovery platform built around location. Developers sign in with GitHub, pick their city, import their public repos, and immediately see what other developers are building, nearby and globally.

Onboarding is short and every step after the city is optional: city (or "can't find my city", which keeps global discovery), build status, name and bio, repository import, then an optional list of builders in the chosen city to follow one by one (shown only when there is at least one; nothing is followed without a click). It ends at the page the person was trying to reach, else Explore.

Three surfaces, each with a single job:

- **Home** — activity from people you follow, from the last 30 days. Your network, nothing else. Emptiness here means you need to follow more people (or they have been quiet), not that the product is broken. Suggestions for someone who follows nobody sit in a separate "builders near you" block, never in the feed.
- **Explore** — discovery of projects, builders and posts, everywhere or in the cities you pick, open to signed-out visitors. The order is explained in words: most recent public work first, and for members, projects matching their stack first. Primary-language and topic filters live in the URL. Strict filtering when cities are selected; an explicit "browse everywhere" when a city is empty.
- **City pages** (`/c/{city}`) — one public page per catalogue city: real counts, recent work, builders, recent posts and nearby active cities on one map. They replace the retired Pulse chart; there are no ranks or leaderboards.

Core actions across surfaces: like a project, comment, follow a developer, send a DM, save a project to a private Saved list. All social actions feel local-first — they commit immediately and report failures honestly. Unfollow, unpin and unsave offer undo.

Success looks like: a developer in Bangalore opens Explore and finds three interesting Rust projects from builders in their city within ten seconds of signing in.

## Brand Personality

**Terminal confidence, local-first humanity, no startup polish.**

Three words: precise, grounded, indie.

Voice: terse and lowercase. No marketing copy in the product shell. Labels are instructions, not headlines. Numbers are the UI.

Emotional goals: feel like an IRC room that knew your city, not a SaaS growth funnel. Mild delight from the city-based discovery layer. Zero friction from social actions.

## Anti-references

- **GitHub.com** — we sit on top of it, we don't look like it. Avoid the GitHub green-on-white contribution graph palette, the Primer component system, or any layout that reads as "this is a GitHub clone."
- **Generic SaaS dark mode** — neon accents on `#0d0d0d`, glassmorphism card panels, animated gradient hero sections, floating orbs. If it looks like a 2022 SaaS landing, it's wrong.
- **LinkedIn-style networking UI** — endorsement badges, "connection degree" labels, engagement-maximizing notification spam, profile completion meters.
- **Product Hunt** — voting/upvote mechanics, day-of-launch fever, hunter/maker framing, red-on-white energy.
- **Twitter/X** — trending injection into a following feed, infinite algorithmic override, follower-count-as-status signals.
- **Glassmorphism as default** — blur panels, frost glass cards, translucent sidebars. Use never; purposeful blur is for modals only.

## Design Principles

1. **Data before chrome.** Metrics, names, repo slugs, and timestamps are the interface. Decoration is always subtractive. If a visual element carries no information, remove it.
2. **Terminal confidence.** IBM Plex Mono is the dominant product voice. Sans is reserved for human-authored text (bios, READMEs, comments). Switching fonts signals a register shift from product to content.
3. **City-first social.** Location shapes discovery scope, label copy, and navigation defaults. City is the product's core discriminator, and every surface that shows content should make geographic context legible: disclosed cities are links to their city page. A person who cannot find their city still gets global discovery; they are just not on a city's list until they set one.
4. **Honest empty states.** Empty means empty. A following feed with no follows is intentionally empty — the nudge is the experience, not injected trending content. Never fill a gap with algorithmic override.
5. **Local commits first.** All user-facing actions complete locally before any external sync, and a failure is reported plainly — never blocking, never opaque.
6. **Location privacy is enforced on the server.** Location visibility (exact city, region only, hidden) and discovery participation are separate settings, and the server applies both to every response, city membership, count and map point, never the client alone. Exact-city builders appear in their city when their discovery setting allows. Region-only builders show a region label and never a city, city link or city membership. Hidden builders show no location and are absent from city lists, counts and map dots, but may still appear in global discovery if they choose to. A change applies to the next result and to maintained data. No clocks, no coordinates.
7. **Explainable order, not popularity.** Builders are ordered by their most recent publicly visible work (releases, posts, repository pushes), with new builders visible before they ship. Follower counts, likes, comments and profile visits never rank anyone. No numbered leaderboards, match percentages or "recommended" labels.

## Accessibility & Inclusion

WCAG 2.1 AA minimum. Specific commitments:

- Skip-to-main-content link present and functional on every route (keyboard-only users land in main content after navigation).
- Minimum 44px touch targets on all interactive elements in the mobile shell (tab bar, notification rows, like/follow/DM buttons).
- Focus-visible styles use the solid theme accent as a 2px outline at 2px offset — never translucent, never suppressed.
- Unread counts are part of the link's accessible name ("notifications, 3 unread"), not only a visual badge.
- No visible text below 11px; inputs are 16px on touch screens so mobile browsers do not zoom.
- Color is never the sole indicator of state (active nav items have both color and an accent bar/pill marker).
- `font-variant-numeric: tabular-nums` on all numeric UI to prevent layout shift during count updates.
- Reduced-motion: skeleton pulses, entrance and reaction animations and the map ping are suppressed via `prefers-reduced-motion: reduce`.
