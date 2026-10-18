// The part of the Workers runtime module src/server.ts uses. The project has
// no @cloudflare/workers-types; declare only what is imported.
declare module 'cloudflare:workers' {
  /** Keeps the Worker alive for `promise` after the response is sent. */
  export function waitUntil(promise: Promise<unknown>): void
}
