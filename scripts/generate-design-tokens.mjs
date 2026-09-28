#!/usr/bin/env node
// Generates the YAML front matter of docs/DESIGN.md from src/styles.css, so
// the documented tokens are the shipped tokens (plan item E1).
//
//   node scripts/generate-design-tokens.mjs          rewrite the front matter
//   node scripts/generate-design-tokens.mjs --check  fail if it has drifted
//
// `pnpm design:tokens` and `pnpm design:tokens:check` wrap the two modes; the
// check is part of `pnpm check`, so CI fails when styles.css changes without
// the doc. Only the front matter is generated; the prose below it is written
// by hand.
//
// What is read from styles.css (self-contained parser, no deps):
// - `@theme inline` colour, radius and shadow registrations (the Tailwind
//   utilities), resolved through `var()` against the default theme block;
// - `[data-theme='…']` blocks for the per-theme accents;
// - `@theme` font stacks and `--text-*` type roles, with each role's family
//   and numerals from its `@utility text-*` block;
// - `@font-face` rules that load a self-hosted file;
// - layout and categorical-palette tokens from the default theme block.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STYLES_PATH = path.join(ROOT, 'src/styles.css')
const DESIGN_PATH = path.join(ROOT, 'docs/DESIGN.md')

const NAME = 'Locatic'
const DESCRIPTION =
  'GitHub with a map — developer discovery platform built around location.'

/** Stock shadcn colour names; `--color-X: var(--X)` for these is an alias. */
const SHADCN_COLORS = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
])

const LAYOUT_TOKEN =
  /^--lx-(gutter|section-gap|[a-z-]+-max|[a-z-]+-width|[a-z-]+-height)$/
const CATEGORICAL_TOKEN = /^--lx-(lang|status)-[lc]$/

// ── CSS parsing ─────────────────────────────────────────────────────────────

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function squash(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}

/** Top-level rules as `{ prelude, body }`; statements such as @import are skipped. */
function parseRules(css) {
  const rules = []
  let prelude = ''
  let index = 0
  while (index < css.length) {
    const char = css[index]
    if (char === ';') {
      prelude = ''
      index += 1
    } else if (char === '{') {
      let depth = 1
      let end = index + 1
      while (end < css.length && depth > 0) {
        if (css[end] === '{') depth += 1
        if (css[end] === '}') depth -= 1
        end += 1
      }
      rules.push({
        prelude: squash(prelude),
        body: css.slice(index + 1, end - 1),
      })
      prelude = ''
      index = end
    } else {
      prelude += char
      index += 1
    }
  }
  return rules
}

/**
 * Declarations directly inside a rule body, in source order.
 * @param {string} body
 * @returns {Array<[string, string]>}
 */
function parseDeclarations(body) {
  /** @type {Array<[string, string]>} */
  const declarations = []
  let current = ''
  let parens = 0
  let braces = 0
  for (const char of body) {
    if (char === '(') parens += 1
    if (char === ')') parens -= 1
    if (char === '{') braces += 1
    if (char === '}') {
      braces -= 1
      current = ''
      continue
    }
    if (char === ';' && parens === 0 && braces === 0) {
      const colon = current.indexOf(':')
      if (colon > 0) {
        declarations.push([
          current.slice(0, colon).trim(),
          squash(current.slice(colon + 1)),
        ])
      }
      current = ''
      continue
    }
    if (braces === 0) current += char
  }
  return declarations
}

function findRule(rules, predicate, label) {
  const rule = rules.find(predicate)
  if (!rule) {
    throw new Error(`src/styles.css: no ${label} block found`)
  }
  return rule
}

/** Replaces every `var(--x)` / `var(--x, fallback)` using `vars`, recursively. */
function resolve(value, vars, depth = 0) {
  if (depth > 20) {
    throw new Error(`src/styles.css: var() cycle while resolving ${value}`)
  }
  const start = value.indexOf('var(')
  if (start === -1) return squash(value)

  let parens = 1
  let end = start + 4
  while (end < value.length && parens > 0) {
    if (value[end] === '(') parens += 1
    if (value[end] === ')') parens -= 1
    end += 1
  }
  const inner = value.slice(start + 4, end - 1)
  const comma = inner.indexOf(',')
  const name = (comma === -1 ? inner : inner.slice(0, comma)).trim()
  const fallback = comma === -1 ? undefined : inner.slice(comma + 1).trim()
  const replacement = vars.has(name) ? vars.get(name) : fallback
  if (replacement === undefined) {
    throw new Error(`src/styles.css: ${name} is not defined`)
  }

  return resolve(
    value.slice(0, start) +
      resolve(replacement, vars, depth + 1) +
      value.slice(end),
    vars,
    depth + 1,
  )
}

/** The variable a registration points at, e.g. `var(--lx-accent)` -> `--lx-accent`. */
function referencedVar(value) {
  const match = /^var\((--[\w-]+)\)$/.exec(value)
  return match ? match[1] : null
}

// ── Token model ─────────────────────────────────────────────────────────────

function readTokens(css) {
  const rules = parseRules(stripComments(css))

  const themeRule = findRule(rules, (r) => r.prelude === '@theme', '@theme')
  const inlineRule = findRule(
    rules,
    (r) => r.prelude === '@theme inline',
    '@theme inline',
  )
  const rootRule = findRule(
    rules,
    (r) => r.prelude.split(',').some((part) => part.trim() === ':root'),
    ':root',
  )

  const themeDecls = new Map(parseDeclarations(themeRule.body))
  const rootDecls = parseDeclarations(rootRule.body)
  const rootVars = new Map([...themeDecls, ...rootDecls])

  // Themes: the :root block names the default theme; other blocks override.
  const defaultTheme = /\[data-theme='([\w-]+)'\]/.exec(rootRule.prelude)?.[1]
  if (!defaultTheme) {
    throw new Error('src/styles.css: the :root block names no default theme')
  }
  const themes = [
    { name: defaultTheme, isDefault: true, vars: rootVars },
    ...rules
      .filter((r) => /^\[data-theme='[\w-]+'\]$/.test(r.prelude))
      .map((r) => ({
        name: /\[data-theme='([\w-]+)'\]/.exec(r.prelude)[1],
        isDefault: false,
        vars: new Map([...rootVars, ...parseDeclarations(r.body)]),
      })),
  ]

  // Utility registrations.
  const colors = []
  const shadcnAliases = []
  const radii = []
  const shadows = []
  for (const [name, value] of parseDeclarations(inlineRule.body)) {
    if (name.startsWith('--color-')) {
      const key = name.slice('--color-'.length)
      const entry = { key, raw: value, value: resolve(value, rootVars) }
      if (SHADCN_COLORS.has(key) && referencedVar(value) === `--${key}`) {
        shadcnAliases.push(entry)
      } else {
        colors.push(entry)
      }
    } else if (name.startsWith('--radius-')) {
      radii.push({ key: name.slice('--radius-'.length), raw: value })
    } else if (name.startsWith('--shadow-')) {
      shadows.push({ key: name.slice('--shadow-'.length), raw: value })
    }
  }

  const aliasOf = (entry, scale) => {
    const target = scale.find(
      (candidate) =>
        candidate !== entry &&
        referencedVar(candidate.raw) !== null &&
        referencedVar(candidate.raw) === referencedVar(entry.raw) &&
        referencedVar(candidate.raw).startsWith('--lx-'),
    )
    return target?.key ?? null
  }
  const splitScale = (scale) => {
    const own = scale.filter(
      (entry) =>
        referencedVar(entry.raw)?.startsWith(`--lx-`) &&
        referencedVar(entry.raw).endsWith(`-${entry.key}`),
    )
    const aliases = scale
      .filter((entry) => !own.includes(entry))
      .map((entry) => ({
        key: entry.key,
        value: aliasOf(entry, own) ?? resolve(entry.raw, rootVars),
      }))
    return {
      own: own.map((entry) => ({
        key: entry.key,
        value: resolve(entry.raw, rootVars),
      })),
      aliases,
    }
  }

  // Type roles: `--text-<role>` plus `--text-<role>--<property>`.
  const utilities = new Map(
    rules
      .filter((r) => r.prelude.startsWith('@utility '))
      .map((r) => [
        r.prelude.slice('@utility '.length),
        new Map(parseDeclarations(r.body)),
      ]),
  )
  const roles = [...themeDecls.keys()]
    .filter((name) => /^--text-[a-z]+$/.test(name))
    .map((name) => {
      const role = name.slice('--text-'.length)
      const utility = utilities.get(`text-${role}`) ?? new Map()
      const property = (suffix) => themeDecls.get(`${name}--${suffix}`)
      const family = utility.get('font-family')
      return {
        role,
        fields: [
          ['fontFamily', family ? resolve(family, rootVars) : undefined],
          ['fontSize', themeDecls.get(name)],
          ['fontWeight', property('font-weight')],
          ['lineHeight', property('line-height')],
          ['letterSpacing', property('letter-spacing')],
          ['fontVariantNumeric', utility.get('font-variant-numeric')],
        ].filter(([, value]) => value !== undefined),
      }
    })

  // Self-hosted font files by family.
  const selfHosted = new Map()
  for (const rule of rules.filter((r) => r.prelude === '@font-face')) {
    const decls = new Map(parseDeclarations(rule.body))
    if (!/url\(/.test(decls.get('src') ?? '')) continue
    const family = decls.get('font-family').replace(/^['"]|['"]$/g, '')
    const weights = selfHosted.get(family) ?? []
    weights.push(decls.get('font-weight'))
    selfHosted.set(family, weights)
  }

  const fontStacks = [...themeDecls.entries()]
    .filter(([name]) => /^--font-[a-z]+$/.test(name))
    .map(([name, value]) => ({ key: name.slice('--font-'.length), value }))

  const pick = (pattern) =>
    rootDecls
      .filter(([name]) => pattern.test(name))
      .map(([name, value]) => ({
        key: name.slice('--lx-'.length),
        value: resolve(value, rootVars),
      }))

  // The Locatic colour a shadcn alias shares a variable with (e.g. `muted`
  // and `surface-alt` both read `--muted`), else its resolved value.
  const varChain = (raw) => {
    const chain = []
    let name = referencedVar(raw)
    while (name && !chain.includes(name)) {
      chain.push(name)
      name = rootVars.has(name) ? referencedVar(rootVars.get(name)) : null
    }
    return chain
  }
  const shadcn = shadcnAliases.map((entry) => {
    const chain = varChain(entry.raw)
    const shared = colors.find((color) =>
      varChain(color.raw).some((name) => chain.includes(name)),
    )
    return { key: entry.key, value: shared?.key ?? entry.value }
  })

  return {
    colors,
    shadcn,
    themes: themes.map((theme) => ({
      name: theme.name,
      isDefault: theme.isDefault,
      accent: resolve('var(--lx-accent)', theme.vars),
      accent2: resolve('var(--lx-accent-2)', theme.vars),
    })),
    roles,
    fontStacks,
    selfHosted,
    radius: splitScale(radii),
    shadow: splitScale(shadows),
    layout: pick(LAYOUT_TOKEN),
    categorical: pick(CATEGORICAL_TOKEN),
  }
}

// ── YAML output ─────────────────────────────────────────────────────────────

function scalar(value) {
  const text = String(value)
  if (/^-?\d+(\.\d+)?$/.test(text)) return text
  if (text.includes("'")) {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return `'${text}'`
}

function yamlKey(key) {
  return /^[\w-]+$/.test(key) ? key : scalar(key)
}

function section(title, entries, indent = '  ') {
  return [
    `${title}:`,
    ...entries.map(
      ({ key, value }) => `${indent}${yamlKey(key)}: ${scalar(value)}`,
    ),
  ]
}

function renderFrontMatter(tokens) {
  const lines = [
    '---',
    '# Generated from src/styles.css by scripts/generate-design-tokens.mjs.',
    '# Do not edit by hand: run `pnpm design:tokens`. `pnpm check` runs',
    '# `pnpm design:tokens:check`, which fails when this block drifts.',
    `name: ${NAME}`,
    `description: ${scalar(DESCRIPTION)}`,
    '# Tailwind colour utilities (bg-*, text-*, border-*), default theme.',
    ...section('colors', tokens.colors),
    '# Stock shadcn utilities: the Locatic colour they share, else their value.',
    ...section('shadcn-aliases', tokens.shadcn),
    '# Accent family per theme (<html data-theme>); every other token is shared.',
    'themes:',
  ]
  for (const theme of tokens.themes) {
    lines.push(`  ${theme.name}:`)
    if (theme.isDefault) lines.push('    default: true')
    lines.push(`    accent: ${scalar(theme.accent)}`)
    lines.push(`    accent-2: ${scalar(theme.accent2)}`)
  }

  lines.push('fonts:')
  for (const stack of tokens.fontStacks) {
    lines.push(`  ${stack.key}: ${scalar(stack.value)}`)
  }
  lines.push('  self-hosted:')
  for (const [family, weights] of tokens.selfHosted) {
    lines.push(`    ${yamlKey(family)}: ${scalar(weights.join(', '))}`)
  }

  lines.push('# Type roles: Tailwind text-<role> utilities.', 'typography:')
  for (const { role, fields } of tokens.roles) {
    lines.push(`  ${role}:`)
    for (const [field, value] of fields) {
      lines.push(`    ${field}: ${scalar(value)}`)
    }
  }

  lines.push(
    ...section('rounded', tokens.radius.own),
    '# Stock radius steps and what they render as.',
    ...section('rounded-aliases', tokens.radius.aliases),
    ...section('shadows', tokens.shadow.own),
    ...section('shadow-aliases', tokens.shadow.aliases),
    ...section('layout', tokens.layout),
    '# One lightness and chroma per categorical palette; hues live in code.',
    ...section('categorical', tokens.categorical),
    '---',
  )
  return `${lines.join('\n')}\n`
}

// ── Main ────────────────────────────────────────────────────────────────────

function splitFrontMatter(markdown) {
  if (!markdown.startsWith('---\n')) {
    return { frontMatter: '', body: markdown }
  }
  const end = markdown.indexOf('\n---\n', 4)
  if (end === -1) {
    throw new Error('docs/DESIGN.md: front matter is not closed with ---')
  }
  return {
    frontMatter: markdown.slice(0, end + 5),
    body: markdown.slice(end + 5),
  }
}

const checkOnly = process.argv.includes('--check')
const expected = renderFrontMatter(
  readTokens(readFileSync(STYLES_PATH, 'utf8')),
)
const design = readFileSync(DESIGN_PATH, 'utf8')
const { frontMatter, body } = splitFrontMatter(design)

if (frontMatter === expected) {
  console.log(
    'design tokens: docs/DESIGN.md front matter matches src/styles.css',
  )
  process.exit(0)
}

if (checkOnly) {
  const actualLines = frontMatter.split('\n')
  const expectedLines = expected.split('\n')
  const firstDiff = expectedLines.findIndex(
    (line, index) => line !== actualLines[index],
  )
  console.error(
    'design tokens: docs/DESIGN.md front matter is out of date with src/styles.css.',
  )
  console.error(`  first difference at front-matter line ${firstDiff + 1}:`)
  console.error(`    expected: ${expectedLines[firstDiff] ?? '(end)'}`)
  console.error(`    found:    ${actualLines[firstDiff] ?? '(end)'}`)
  console.error('  Run `pnpm design:tokens` and commit docs/DESIGN.md.')
  process.exit(1)
}

writeFileSync(
  DESIGN_PATH,
  `${expected}${body.startsWith('\n') ? body : `\n${body}`}`,
)
console.log('design tokens: wrote docs/DESIGN.md front matter')
