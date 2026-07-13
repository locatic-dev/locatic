# Frontend utilities (`src/lib/`)

Small, shared utilities with focused domains.

- Prefer pure, side-effect-free functions and a colocated unit test for non-trivial behavior.
- Keep UI in `components/`, domain logic in `features/`, and provider concerns in `integrations/`.
- Reuse `cn()` from `utils.ts`, existing formatters, and route helpers instead of duplicating them.
- Motion variants belong in `motion.ts`; theme identifiers belong in `theme.ts`. Do not import `domMax` directly in route chunks—use `motion-features.ts`.
