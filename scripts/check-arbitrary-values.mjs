#!/usr/bin/env node
// Arbitrary-value guardrail.
//
// Run: node scripts/check-arbitrary-values.mjs [--update]   (part of `pnpm check`)
//
// Reports arbitrary font sizes, radii, shadows and hex colours in
// src/features and src/routes, where the design tokens should be used
// instead: text-display|headline|title|body|label|meta, rounded-control|card|
// pill, shadow-card|floating and the semantic colour utilities. Tests are
// skipped.
//
// Existing hits are recorded per file and kind in
// scripts/arbitrary-values.allowlist.json. The check fails only when a file
// has more hits of a kind than its allowlist entry (a new hit); fewer hits are
// reported so the entry can be lowered. `--update` rewrites the allowlist to
// the current counts; use it after removing hits, not to accept new ones.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['src/features', 'src/routes']
const ALLOWLIST_PATH = 'scripts/arbitrary-values.allowlist.json'
const SOURCE_FILE = /\.(?:ts|tsx|css)$/
const TEST_FILE = /(?:^|\/)__tests__\/|\.test\.tsx?$/

/** Lengths and length functions: a `text-[…]` holding one is a font size. */
const LENGTH =
  /^(?:length:)?(?:-?[\d.]+(?:px|rem|em|%|vw|vh|svh|dvh|ch)|(?:clamp|calc|min|max)\()/

const KINDS = [
  {
    kind: 'font-size',
    pattern: /(?<![\w-])text-\[([^\]\s]+)\]/g,
    accept: (match) => LENGTH.test(match[1]),
  },
  { kind: 'font-size', pattern: /\bfontSize\s*:\s*['"\d]/g },
  {
    kind: 'radius',
    pattern: /(?<![\w-])rounded(?:-[a-z]{1,2})?-\[[^\]\s]+\]/g,
  },
  { kind: 'radius', pattern: /\bborderRadius\s*:\s*['"\d]/g },
  { kind: 'shadow', pattern: /(?<![\w-])shadow-\[[^\]\s]+\]/g },
  { kind: 'shadow', pattern: /\bboxShadow\s*:\s*['"`]/g },
  {
    kind: 'hex-colour',
    pattern:
      /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
  },
]

function listFiles(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return listFiles(path)
      return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(path) ? [path] : []
    },
  )
}

function scan() {
  /** @type {Record<string, Record<string, Array<{ line: number, text: string }>>>} */
  const hits = {}
  for (const file of SCAN_DIRS.flatMap(listFiles).sort((a, b) =>
    a.localeCompare(b),
  )) {
    const lines = readFileSync(join(ROOT, file), 'utf8').split('\n')
    lines.forEach((line, index) => {
      for (const { kind, pattern, accept } of KINDS) {
        for (const match of line.matchAll(pattern)) {
          if (accept && !accept(match)) continue
          const path = relative(ROOT, join(ROOT, file))
          hits[path] ??= {}
          hits[path][kind] ??= []
          hits[path][kind].push({ line: index + 1, text: match[0] })
        }
      }
    })
  }
  return hits
}

function toCounts(hits) {
  return Object.fromEntries(
    Object.entries(hits).map(([file, kinds]) => [
      file,
      Object.fromEntries(
        Object.entries(kinds)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([kind, list]) => [kind, list.length]),
      ),
    ]),
  )
}

/** @returns {Record<string, Record<string, number>>} */
function readAllowlist() {
  try {
    return JSON.parse(readFileSync(join(ROOT, ALLOWLIST_PATH), 'utf8')).files
  } catch {
    return {}
  }
}

const hits = scan()
const counts = toCounts(hits)

if (process.argv.includes('--update')) {
  writeFileSync(
    join(ROOT, ALLOWLIST_PATH),
    `${JSON.stringify(
      {
        $comment:
          'Existing arbitrary values in src/features and src/routes. Lower or remove entries as files move to tokens; never raise one to accept a new hit. Written by `node scripts/check-arbitrary-values.mjs --update`.',
        files: counts,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`wrote ${ALLOWLIST_PATH}`)
}

const allowlist = readAllowlist()
/** @type {Record<string, number>} */
const totals = {}
const failures = []
const lowered = []

for (const [file, kinds] of Object.entries(hits)) {
  for (const [kind, list] of Object.entries(kinds)) {
    totals[kind] = (totals[kind] ?? 0) + list.length
    const allowed = allowlist[file]?.[kind] ?? 0
    if (list.length > allowed) {
      failures.push(
        `${file}: ${list.length - allowed} new ${kind} value(s) (allowlisted ${allowed})\n${list
          .map(({ line, text }) => `    ${file}:${line}  ${text}`)
          .join('\n')}`,
      )
    }
  }
}

for (const [file, kinds] of Object.entries(allowlist)) {
  for (const [kind, allowed] of Object.entries(kinds)) {
    const current = counts[file]?.[kind] ?? 0
    if (current < allowed) {
      lowered.push(`${file}: ${kind} ${allowed} -> ${current}`)
    }
  }
}

const summary = Object.entries(totals)
  .map(([kind, count]) => `${kind} ${count}`)
  .join(', ')
const allowlistSize = Object.values(allowlist).reduce(
  (sum, kinds) => sum + Object.values(kinds).reduce((a, b) => a + b, 0),
  0,
)
console.log(
  `arbitrary values in ${SCAN_DIRS.join(', ')}: ${summary || 'none'} (allowlist ${allowlistSize} across ${Object.keys(allowlist).length} files)`,
)

if (lowered.length > 0) {
  console.log(
    `allowlist can be lowered (run with --update):\n  ${lowered.join('\n  ')}`,
  )
}

if (failures.length > 0) {
  console.error(
    `✗ new arbitrary values; use the design tokens instead:\n${failures.join('\n')}`,
  )
  process.exit(1)
}

console.log('✓ no new arbitrary values')
