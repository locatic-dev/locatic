# Product

## Register

product

## Users

Developers with active side projects who want visibility for their work without self-promotion overhead. They live in GitHub, build things regularly, and want to know what people nearby are shipping. Secondary audience: curious developers discovering new projects, potential collaborators, and indie hackers looking for interesting builders to follow or DM.

Primary context: authenticated desktop app (coding session breaks, morning feed check), secondary context: mobile on the go (quick notification check, follow/like actions while commuting).

Job to be done: discover what builders near me are working on right now. Secondary job: be discoverable to people who would find my work interesting.

## Product Purpose

Locatic is "GitHub with a map" — a developer discovery platform built around location. Developers sign in with GitHub, pick their city, import their public repos, and immediately see what other developers are building, nearby and globally.

Three surfaces, each with a single job:

- **Home** — projects from people you follow. Your network, nothing else. Emptiness here means you need to follow more people, not that the product is broken.
- **Explore** — city-filtered algorithmic feed. Passive and personalized. Strict filtering when cities are selected; honest global fallback when they are not.
- **Pulse** — ranked trending chart. Intentional browsing, publicly accessible without login.

Core actions across surfaces: like a project (optionally syncs a GitHub star as best-effort), comment, follow a developer, send a DM. All social actions feel local-first — they commit immediately and surface sync status honestly.

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
3. **City-first social.** Location shapes ranking, label copy, and navigation defaults. City is not optional metadata — it is the product's core discriminator. Every surface that shows content should make geographic context legible.
4. **Honest empty states.** Empty means empty. A following feed with no follows is intentionally empty — the nudge is the experience, not injected trending content. Never fill a gap with algorithmic override.
5. **Local commits first.** All user-facing actions complete locally before any external sync. GitHub star sync is best-effort and labeled when it fails — never blocking, never opaque.

## Accessibility & Inclusion

WCAG 2.1 AA minimum. Specific commitments:

- Skip-to-main-content link present and functional on every route (keyboard-only users land in main content after navigation).
- Minimum 44px touch targets on all interactive elements in the mobile shell (tab bar, notification rows, like/follow/DM buttons).
- Focus-visible styles use `oklch(72% 0.17 185)` (brand teal) at 2px offset — never suppressed.
- Color is never the sole indicator of state (active nav items have both color and an accent bar/pill marker).
- `font-variant-numeric: tabular-nums` on all numeric UI to prevent layout shift during count updates.
- Reduced-motion: shimmer animations and fade-up transitions are suppressed via `@media (prefers-reduced-motion: reduce)`.
