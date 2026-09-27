# UI primitives (`src/components/ui/`)

Reusable, domain-neutral components built with shadcn/Radix patterns and Tailwind.

- Extend the closest existing primitive before adding a new one; use `cn()` and semantic tokens rather than one-off styles.
- Keep public props small, typed, and composable. Do not import feature state, Convex APIs, or route logic here.
- Native controls need labels; custom controls need equivalent role, keyboard behavior, focus visibility, and disabled semantics.
- Do not put user-generated text in `whitespace-nowrap`; preserve wrapping and overflow safety.
- Keep behavior changes covered by colocated `__tests__/` tests.

- Buttons: variants `primary | secondary | ghost | danger` (default secondary), sizes `sm | meta | md | icon | touch`; no className overrides for font, radius, ring or colour. Tokens and type roles are documented in `docs/DESIGN.md`.
