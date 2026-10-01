// Pulse is retired (plan decision D1, items A0 and E2). City pages
// (`api.cities.getPage`) carry local discovery; the `listPublic` query and the
// hourly `rebuildSnapshots` job were removed. The `pulse_snapshots` table and
// its rows are kept on purpose (no data deletion in this pass).
//
// This module stays, empty, only because `convex/_generated/api.d.ts` imports
// it. Delete it together with `convex/lib/pulse.ts` and
// `convex/lib/__tests__/pulse.test.ts`, then run `npx convex codegen` in the
// same change so the generated API drops both modules.
export {}
