# Feature modules (`src/features/`)

Features own domain-specific UI, state, query/mutation hooks, copy, and pure helpers. Routes compose them; shared primitives live outside this directory.

- Keep a change within its owning feature. For cross-feature data contracts, use `contracts.ts` rather than importing another feature's internals.
- Put URL/search normalization in a feature `state.ts`; keep dirty-state and formatting helpers pure and unit-testable.
- Reuse query options from `src/integrations/convex/query-options.ts` and mutations from the domain module; preserve optimistic-update/error behavior.
- Use `components/ui` for primitives and `components/app-shell` for chrome. Do not put route-level auth or URL orchestration here.
- Add focused tests beside the feature for behavior, privacy, pagination, or navigation changes.
