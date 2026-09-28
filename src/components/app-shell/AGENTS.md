# Application shell (`src/components/app-shell/`)

Shared navigation, layout, and route-feedback components.

- Keep shell components route-agnostic; receive state through props or established hooks instead of embedding feature logic.
- Reuse `route-pending.tsx` for pending UIs and keep its markup accessible to assistive technology.
- Public pages use `PublicHeader` and `PublicFooter`; authenticated navigation belongs in the authenticated shell.
- Preserve responsive navigation, keyboard access, and the current active-route semantics when changing links or controls.

- Shell page titles use `PageHeader` at the headline role; `MemberShell` wraps authenticated pages (bootstrap, unread counts, `AppLayout`).
