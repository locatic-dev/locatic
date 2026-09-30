#!/usr/bin/env node
// WCAG contrast matrix for the Locatic token scale.
//
// Run: node scripts/check-contrast.mjs (also part of `pnpm check`).
//
// The pairs are generated from the role table below, for every theme declared
// in src/styles.css:
// - every text role must clear 4.5:1 on every surface, including the
//   translucent state surfaces (selected, outgoing bubble);
// - every indicator role (control borders, focus ring, selected bar, unread
//   dot, strong border) must clear 3:1 on every surface;
// - label-on-fill pairs (brand button, danger button, tinted chips) must clear
//   4.5:1.
// There is no metadata tier: muted text is text. The gate also fails when a
// `--lx-*` colour token in styles.css is not covered by the table, so a new
// token cannot ship without a declared role.
//
// Colour math (self-contained, no deps): OKLCH -> OKLab -> linear sRGB using
// Björn Ottosson's matrices, each channel clipped to the sRGB gamut, then the
// WCAG 2.x relative luminance and contrast ratio. Clipping is what browsers
// do on sRGB displays; CSS Color 4 gamut mapping (chroma reduction) and
// wide-gamut displays can render out-of-gamut tokens slightly differently.
//
// Alpha compositing: translucent tokens are flattened over their declared
// backdrop in gamma-encoded sRGB, because browsers blend `source-over` in the
// non-linear sRGB space by default (CSS Compositing Level 1). Blending in
// linear light would overstate how much a translucent accent lightens a dark
// surface and understate text contrast on it.

import { readFileSync } from 'node:fs'

// ── Role table ──────────────────────────────────────────────────────────────
// The first token of each entry is canonical; any further tokens are aliases
// and must resolve to the same colour in every theme.

/** Surfaces that text and indicators sit on. `over` names the opaque surface
 *  a translucent token is composited over (the lightest one it appears on). */
const SURFACES = {
  canvas: { tokens: ['--lx-bg'] },
  chrome: { tokens: ['--lx-surface-chrome'] },
  surface: { tokens: ['--lx-surface'] },
  alt: { tokens: ['--lx-surface-alt', '--lx-state-hover'] },
  raised: { tokens: ['--lx-surface-raised'] },
  selected: { tokens: ['--lx-state-selected'], over: 'surface' },
  outgoing: { tokens: ['--lx-outgoing-surface'], over: 'canvas' },
}

/** Text roles: 4.5:1 on every surface. */
const TEXT_ROLES = {
  text: ['--lx-text'],
  muted: ['--lx-text-2'],
  danger: ['--lx-danger'],
  success: ['--lx-success'],
  warning: ['--lx-warning'],
  place: ['--lx-place'],
  liked: ['--lx-liked'],
  brand: ['--lx-accent'],
  'brand-2': ['--lx-accent-2'],
}

/** Indicator roles (WCAG 1.4.11 non-text contrast): 3:1 on every surface. */
const INDICATOR_ROLES = {
  control: ['--lx-border-control'],
  'line-strong': ['--lx-border-strong'],
  focus: ['--lx-focus'],
  'selected-bar': ['--lx-selected-bar'],
  unread: ['--lx-unread-dot'],
  live: ['--lx-live'],
}

/** Labels on filled or tinted backgrounds: 4.5:1. */
const FILL_PAIRS = [
  { label: 'brand-fg on brand', fg: '--primary-foreground', bg: '--lx-accent' },
  {
    label: 'danger-fg on danger',
    fg: '--destructive-foreground',
    bg: '--lx-danger',
  },
  {
    label: 'brand on brand-quiet',
    fg: '--lx-accent',
    bg: '--lx-accent-quiet',
    over: 'surface',
  },
  {
    label: 'brand-2 on brand-2-quiet',
    fg: '--lx-accent-2',
    bg: '--lx-accent-2-quiet',
    over: 'surface',
  },
  {
    label: 'place on place-quiet',
    fg: '--lx-place',
    bg: '--lx-place-quiet',
    over: 'surface',
  },
]

/** Colour tokens deliberately outside the matrix, with the reason. */
const EXEMPT = {
  '--lx-border':
    'decorative divider; never the only indicator of a state (WCAG 1.4.11)',
  '--lx-text-disabled':
    'inactive controls are exempt from text contrast (WCAG 1.4.3)',
}

const TEXT_MIN = 4.5
const INDICATOR_MIN = 3.0

const ROLE_GROUPS = [
  { kind: 'text', roles: TEXT_ROLES, min: TEXT_MIN },
  { kind: 'indicator', roles: INDICATOR_ROLES, min: INDICATOR_MIN },
]

// ── OKLCH -> linear sRGB -> luminance ───────────────────────────────────────
function oklchToLinearSrgb({ L, C, h }) {
  const hue = (h * Math.PI) / 180
  const a = C * Math.cos(hue)
  const b = C * Math.sin(hue)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)))
}

const encodeGamma = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
const decodeGamma = (c) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

// Flatten a colour over an opaque linear-sRGB backdrop, blending in
// gamma-encoded sRGB as browsers do.
function flatten(color, backdropLinear) {
  const fg = oklchToLinearSrgb(color)
  if (color.alpha >= 1) return fg
  if (!backdropLinear) {
    throw new Error(`Translucent colour needs a backdrop: ${color.source}`)
  }
  return fg.map((channel, i) =>
    decodeGamma(
      encodeGamma(channel) * color.alpha +
        encodeGamma(backdropLinear[i]) * (1 - color.alpha),
    ),
  )
}

function relativeLuminance(linear) {
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(aLinear, bLinear) {
  const l1 = relativeLuminance(aLinear)
  const l2 = relativeLuminance(bLinear)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// ── CSS token source ────────────────────────────────────────────────────────
// The shipped stylesheet is canonical. This narrow parser fails closed when
// the declarations no longer follow the documented token shape.
const styles = readFileSync(
  new URL('../src/styles.css', import.meta.url),
  'utf8',
)
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function getDeclarations(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(
    new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'),
  )
  if (!match) {
    throw new Error(`Missing theme token block: ${selector}`)
  }

  return Object.fromEntries(
    [...match[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value.replace(/\s+/g, ' ').trim(),
    ]),
  )
}

// Substitutes var() references declared in the same theme block. References
// to tokens declared elsewhere (for example `@theme` fonts) stay as written,
// so they never parse as colours.
function resolveValue(name, declarations, seen = []) {
  if (seen.includes(name)) {
    throw new Error(`Circular token reference: ${[...seen, name].join(' -> ')}`)
  }
  return declarations[name].replace(/var\((--[\w-]+)\)/g, (reference, ref) =>
    ref in declarations
      ? resolveValue(ref, declarations, [...seen, name])
      : reference,
  )
}

const OKLCH =
  /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/

function isColourValue(value) {
  return value.startsWith('oklch(')
}

function parseColour(name, declarations, themeName) {
  if (!(name in declarations)) {
    throw new Error(`[${themeName}] role table names undefined token ${name}`)
  }
  const source = resolveValue(name, declarations)
  const match = source.match(OKLCH)
  if (!match) {
    throw new Error(
      `[${themeName}] expected an OKLCH colour for ${name}, received ${source}`,
    )
  }
  const color = {
    L: Number(match[1]) / 100,
    C: Number(match[2]),
    h: Number(match[3]),
    alpha: match[4] === undefined ? 1 : Number(match[4]),
    source: `${name} = ${source}`,
  }
  if (![color.L, color.C, color.h, color.alpha].every(Number.isFinite)) {
    throw new Error(`[${themeName}] malformed colour for ${name}: ${source}`)
  }
  return color
}

const themeNames = Array.from(
  new Set(
    [...styles.matchAll(/\[data-theme='([^']+)'\]/g)].map(([, themeName]) =>
      themeName.trim(),
    ),
  ),
)

if (themeNames.length === 0) {
  throw new Error('Missing data-theme token declarations')
}

const defaultThemeName = themeNames[0]
const baseDeclarations = getDeclarations(
  `:root,\n[data-theme='${defaultThemeName}']`,
)

const THEMES = Object.fromEntries(
  themeNames.map((themeName) => [
    themeName,
    themeName === defaultThemeName
      ? baseDeclarations
      : {
          ...baseDeclarations,
          ...getDeclarations(`[data-theme='${themeName}']`),
        },
  ]),
)

// ── Coverage: every --lx-* colour token has a declared role ─────────────────
const covered = new Set([
  ...Object.values(SURFACES).flatMap(({ tokens }) => tokens),
  ...Object.values(TEXT_ROLES).flat(),
  ...Object.values(INDICATOR_ROLES).flat(),
  ...FILL_PAIRS.flatMap(({ fg, bg }) => [fg, bg]),
  ...Object.keys(EXEMPT),
])

const errors = []

for (const [themeName, declarations] of Object.entries(THEMES)) {
  for (const name of Object.keys(declarations)) {
    if (!name.startsWith('--lx-')) continue
    if (!isColourValue(resolveValue(name, declarations))) continue
    if (!covered.has(name)) {
      errors.push(
        `[${themeName}] ${name} is a colour token with no role in scripts/check-contrast.mjs`,
      )
    }
  }
}

// ── Pairs ───────────────────────────────────────────────────────────────────
const rows = []

function sameColour(a, b) {
  return (
    a.alpha === b.alpha &&
    Math.abs(a.L - b.L) < 1e-9 &&
    Math.abs(a.C - b.C) < 1e-9 &&
    Math.abs(a.h - b.h) < 1e-9
  )
}

for (const [themeName, declarations] of Object.entries(THEMES)) {
  const colour = (name) => parseColour(name, declarations, themeName)

  // Aliases must not drift from their canonical token.
  for (const tokens of [
    ...Object.values(SURFACES).map(({ tokens: list }) => list),
    ...Object.values(TEXT_ROLES),
    ...Object.values(INDICATOR_ROLES),
  ]) {
    const [canonical, ...aliases] = tokens
    for (const alias of aliases) {
      if (!sameColour(colour(canonical), colour(alias))) {
        errors.push(`[${themeName}] alias ${alias} differs from ${canonical}`)
      }
    }
  }

  const opaque = {}
  const surfaceLinear = {}
  for (const [surfaceName, { tokens, over }] of Object.entries(SURFACES)) {
    if (over) continue
    const linear = flatten(colour(tokens[0]))
    opaque[surfaceName] = linear
    surfaceLinear[surfaceName] = linear
  }
  for (const [surfaceName, { tokens, over }] of Object.entries(SURFACES)) {
    if (!over) continue
    if (!opaque[over]) {
      throw new Error(`Surface ${surfaceName} composites over unknown ${over}`)
    }
    surfaceLinear[surfaceName] = flatten(colour(tokens[0]), opaque[over])
  }

  for (const { kind, roles, min } of ROLE_GROUPS) {
    for (const [roleName, [token]] of Object.entries(roles)) {
      for (const [surfaceName, bgLinear] of Object.entries(surfaceLinear)) {
        const ratio = contrastRatio(flatten(colour(token), bgLinear), bgLinear)
        rows.push({
          themeName,
          kind,
          fg: roleName,
          bg: surfaceName,
          ratio,
          min,
        })
      }
    }
  }

  for (const { label, fg, bg, over } of FILL_PAIRS) {
    const bgLinear = flatten(colour(bg), over ? opaque[over] : undefined)
    const ratio = contrastRatio(flatten(colour(fg), bgLinear), bgLinear)
    rows.push({
      themeName,
      kind: 'fill',
      fg: label,
      bg: '',
      ratio,
      min: TEXT_MIN,
    })
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const surfaceNames = Object.keys(SURFACES)
const pad = (value, width) => String(value).padEnd(width)
const cellWidth = 10

for (const themeName of themeNames) {
  const themeRows = rows.filter((row) => row.themeName === themeName)
  console.log(`\n[${themeName}]`)
  console.log(
    pad('role (min)', 20) +
      surfaceNames.map((name) => pad(name, cellWidth)).join(''),
  )
  for (const { kind, roles, min } of ROLE_GROUPS) {
    for (const roleName of Object.keys(roles)) {
      const cells = surfaceNames.map((surfaceName) => {
        const row = themeRows.find(
          (r) => r.kind === kind && r.fg === roleName && r.bg === surfaceName,
        )
        const mark = row.ratio >= row.min ? ' ' : '!'
        return pad(`${row.ratio.toFixed(2)}${mark}`, cellWidth)
      })
      console.log(pad(`${roleName} (${min})`, 20) + cells.join(''))
    }
  }
  for (const row of themeRows.filter((r) => r.kind === 'fill')) {
    const mark = row.ratio >= row.min ? '' : ' !'
    console.log(pad(`${row.fg} (${row.min})`, 32) + row.ratio.toFixed(2) + mark)
  }
}

const failures = rows.filter((row) => row.ratio < row.min)
for (const row of failures) {
  errors.push(
    `[${row.themeName}] ${row.fg}${row.bg ? ` on ${row.bg}` : ''}: ${row.ratio.toFixed(2)} < ${row.min}`,
  )
}

console.log(
  `\n${rows.length} pairs across ${themeNames.length} themes (${themeNames.join(', ')}); exempt: ${Object.keys(EXEMPT).join(', ')}`,
)

if (errors.length > 0) {
  console.error(`\n✗ contrast gate FAILED (${errors.length})`)
  for (const error of errors) console.error(`  ${error}`)
  console.error('Adjust token lightness in src/styles.css or the role table.')
  process.exit(1)
}
console.log('✓ contrast gate passed')
