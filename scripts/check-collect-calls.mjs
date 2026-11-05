#!/usr/bin/env node
// `.collect()` guardrail (Convex principle "bounded index reads").
//
// Run: node scripts/check-collect-calls.mjs [--update]   (part of `pnpm check`)
//
// Reports every `.collect()` in convex/ outside internal migrations. A
// migration is an `internal*` function whose name starts with backfill,
// migrate, recount or seed: it runs by hand, in pages, off the request path.
// Everything else (public queries and mutations, crons, webhooks, shared
// helpers) should read through an index with `.take(n)`, `.first()`,
// `.unique()` or `.paginate()` so its cost stays bounded as tables grow.
// Tests and convex/_generated are skipped.
//
// Existing calls are recorded per file and enclosing top-level function in
// scripts/collect-calls.allowlist.json. The check fails only when a function
// has more calls than its allowlist entry (a new call); fewer calls are
// reported so the entry can be lowered. `--update` rewrites the allowlist to
// the current counts; use it after removing calls, not to accept new ones.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIR = 'convex'
const ALLOWLIST_PATH = 'scripts/collect-calls.allowlist.json'
const SKIP = /(?:^|\/)(?:_generated|__tests__)(?:\/|$)|\.test\.ts$/
const COLLECT = /\.collect\(\s*\)/g
const TOP_LEVEL =
  /^(?:export\s+)?(?:(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(\w+)?)/
const MIGRATION_NAME = /^(?:backfill|migrate|recount|seed)/
const INTERNAL_REGISTRATION = /^internal(?:Mutation|Query|Action)$/

function listFiles(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      // POSIX separators keep allowlist keys and SKIP stable on Windows.
      const path = posix.join(dir, entry.name)
      if (SKIP.test(path)) return []
      if (entry.isDirectory()) return listFiles(path)
      return entry.name.endsWith('.ts') ? [path] : []
    },
  )
}

function scan() {
  const calls = []
  for (const file of listFiles(SCAN_DIR).sort((a, b) => a.localeCompare(b))) {
    let owner = { name: '(module)', registration: null }
    readFileSync(join(ROOT, file), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const declaration = line.match(TOP_LEVEL)
        if (declaration) {
          owner = {
            name: declaration[1] ?? declaration[2],
            registration: declaration[3] ?? null,
          }
        }
        for (const _ of line.matchAll(COLLECT)) {
          const migration =
            INTERNAL_REGISTRATION.test(owner.registration ?? '') &&
            MIGRATION_NAME.test(owner.name)
          calls.push({
            file,
            line: index + 1,
            owner: owner.name,
            kind: migration ? 'migration' : (owner.registration ?? 'helper'),
          })
        }
      })
  }
  return calls
}

/** @returns {Record<string, number>} */
function readAllowlist() {
  try {
    return JSON.parse(readFileSync(join(ROOT, ALLOWLIST_PATH), 'utf8'))
      .functions
  } catch {
    return {}
  }
}

const calls = scan()
const reported = calls.filter((call) => call.kind !== 'migration')
/** @type {Record<string, number>} */
const counts = {}
for (const call of reported) {
  const key = `${call.file}#${call.owner}`
  counts[key] = (counts[key] ?? 0) + 1
}

if (process.argv.includes('--update')) {
  writeFileSync(
    join(ROOT, ALLOWLIST_PATH),
    `${JSON.stringify(
      {
        $comment:
          'Existing .collect() calls outside internal migrations, per file#function. Lower or remove entries as reads become bounded; never raise one to accept a new call. Written by `node scripts/check-collect-calls.mjs --update`.',
        functions: Object.fromEntries(
          Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)),
        ),
      },
      null,
      2,
    )}\n`,
  )
  console.log(`wrote ${ALLOWLIST_PATH}`)
}

const allowlist = readAllowlist()
/** @type {Record<string, number>} */
const byKind = {}
for (const call of reported) byKind[call.kind] = (byKind[call.kind] ?? 0) + 1

const failures = []
for (const [key, count] of Object.entries(counts)) {
  const allowed = allowlist[key] ?? 0
  if (count > allowed) {
    const sites = reported
      .filter((call) => `${call.file}#${call.owner}` === key)
      .map((call) => `    ${call.file}:${call.line}  (${call.kind})`)
      .join('\n')
    failures.push(
      `${key}: ${count - allowed} new .collect() (allowlisted ${allowed})\n${sites}`,
    )
  }
}

const lowered = Object.entries(allowlist)
  .filter(([key, allowed]) => (counts[key] ?? 0) < allowed)
  .map(([key, allowed]) => `${key}: ${allowed} -> ${counts[key] ?? 0}`)

const allowlistSize = Object.values(allowlist).reduce((a, b) => a + b, 0)
const migrations = calls.length - reported.length
console.log(
  `.collect() in convex/: ${reported.length} outside migrations (${Object.entries(
    byKind,
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `${kind} ${count}`)
    .join(
      ', ',
    )}); ${migrations} in internal migrations (not reported). Allowlist ${allowlistSize} across ${Object.keys(allowlist).length} functions.`,
)

if (lowered.length > 0) {
  console.log(
    `allowlist can be lowered (run with --update):\n  ${lowered.join('\n  ')}`,
  )
}

if (failures.length > 0) {
  console.error(
    `✗ new unbounded .collect() calls; read through an index with take/first/unique/paginate:\n${failures.join('\n')}`,
  )
  process.exit(1)
}

console.log('✓ no new .collect() calls outside migrations')
