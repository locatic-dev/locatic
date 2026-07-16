#!/usr/bin/env node
// WCAG contrast gate for the Locatic token scale.
//
// Self-contained OKLCH -> sRGB conversion (no deps) + WCAG 2.x contrast ratio.
// Run: node scripts/check-contrast.mjs
//
// Asserts the contrast pairs that matter after the contrast/token pass. Body
// text must clear 4.5:1; large text / non-text metadata must clear 3:1.

import { readFileSync } from 'node:fs'

// ── OKLCH -> linear sRGB -> gamma sRGB ──────────────────────────────────────
function oklchToLinearSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)

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
  ]
}

// Flatten an oklch color (optionally with alpha) over an opaque oklch backdrop,
// returning opaque linear-sRGB. Mirrors how the browser composites our
// translucent tokens (e.g. selected-fill at 0.10 alpha) over a surface.
function resolveLinear({ L, C, h, alpha = 1 }, backdropLinear) {
  const fg = oklchToLinearSrgb(L, C, h)
  if (alpha >= 1) return fg
  return fg.map((c, i) => c * alpha + backdropLinear[i] * (1 - alpha))
}

function relativeLuminance(linear) {
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(fgLinear, bgLinear) {
  const l1 = relativeLuminance(fgLinear)
  const l2 = relativeLuminance(bgLinear)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// ── CSS token source ───────────────────────────────────────────────────────
// The shipped stylesheet is canonical. This narrow parser intentionally fails
// closed if its declarations no longer follow the documented token shape.
const styles = readFileSync(
  new URL('../src/styles.css', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n')

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
      value.trim(),
    ]),
  )
}

function parseOklch(value, label) {
  const match = value?.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/)
  if (!match) {
    throw new Error(
      `Expected opaque OKLCH token for ${label}, received ${value}`,
    )
  }

  return { L: Number(match[1]) / 100, C: Number(match[2]), h: Number(match[3]) }
}

function parseAccent(declarations, label) {
  const lightness = declarations['--lx-accent-l']
  const chroma = declarations['--lx-accent-c']
  const hue = declarations['--lx-accent-h']
  const lightnessMatch = lightness?.match(/^([\d.]+)%$/)

  if (!lightnessMatch || !chroma || !hue) {
    throw new Error(`Incomplete accent token family for ${label}`)
  }

  const parsed = {
    L: Number(lightnessMatch[1]) / 100,
    C: Number(chroma),
    h: Number(hue),
  }

  if (!Object.values(parsed).every(Number.isFinite)) {
    throw new Error(`Malformed accent token family for ${label}`)
  }

  return parsed
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
const defaultTheme = getDeclarations(
  `:root,\n[data-theme='${defaultThemeName}']`,
)
const tokens = {
  canvas: parseOklch(defaultTheme['--background'], '--background'),
  surface: parseOklch(defaultTheme['--card'], '--card'),
  surfaceRaised: parseOklch(
    defaultTheme['--lx-surface-raised'],
    '--lx-surface-raised',
  ),
  textPrimary: parseOklch(defaultTheme['--foreground'], '--foreground'),
  textSecondary: parseOklch(
    defaultTheme['--muted-foreground'],
    '--muted-foreground',
  ),
  textTertiary: parseOklch(defaultTheme['--lx-text-3'], '--lx-text-3'),
  textDisabled: parseOklch(
    defaultTheme['--lx-text-disabled'],
    '--lx-text-disabled',
  ),
  brandForeground: parseOklch(
    defaultTheme['--primary-foreground'],
    '--primary-foreground',
  ),
  liked: parseOklch(defaultTheme['--lx-liked'], '--lx-liked'),
}

const THEMES = Object.fromEntries(
  themeNames.map((themeName) => {
    const declarations =
      themeName === defaultThemeName
        ? defaultTheme
        : getDeclarations(`[data-theme='${themeName}']`)

    return [
      themeName,
      {
        accent: parseAccent(declarations, themeName),
        accent2: parseOklch(
          declarations['--lx-accent-2'],
          `${themeName} accent-2`,
        ),
      },
    ]
  }),
)

const opaque = (t) => oklchToLinearSrgb(t.L, t.C, t.h)

// ── Checks: [label, fg, bg, minRatio] ───────────────────────────────────────
// Translucent fg/bg are composited over the named backdrop first.
const checks = [
  ['primary on canvas (body)', tokens.textPrimary, tokens.canvas, 4.5],
  ['primary on surface (body)', tokens.textPrimary, tokens.surface, 4.5],
  ['secondary on canvas (body)', tokens.textSecondary, tokens.canvas, 4.5],
  ['secondary on surface (body)', tokens.textSecondary, tokens.surface, 4.5],
  ['tertiary on canvas (metadata)', tokens.textTertiary, tokens.canvas, 3.0],
  ['tertiary on surface (metadata)', tokens.textTertiary, tokens.surface, 3.0],
  // Aspirational: we'd like tertiary to clear body contrast too — report only.
  [
    'tertiary on canvas (body target)',
    tokens.textTertiary,
    tokens.canvas,
    4.5,
    true,
  ],
  ['liked on surface', tokens.liked, tokens.surface, 4.5],
]

// Accent-dependent checks, re-run per theme variant.
for (const [themeName, { accent, accent2 }] of Object.entries(THEMES)) {
  const selectedFill = { ...accent, alpha: 0.1 }
  const surfaceAccent = { ...accent, alpha: 0.06 }
  const outgoingSurface = { ...accent, alpha: 0.16 }

  checks.push(
    [
      `[${themeName}] brand-fg on brand (CTA)`,
      tokens.brandForeground,
      accent,
      4.5,
    ],
    [`[${themeName}] brand on canvas (text)`, accent, tokens.canvas, 4.5],
    [`[${themeName}] brand on surface (text)`, accent, tokens.surface, 4.5],
    [
      `[${themeName}] brand on selected-fill`,
      accent,
      { ...selectedFill, over: tokens.surface },
      4.5,
    ],
    [
      `[${themeName}] primary on surface-accent`,
      tokens.textPrimary,
      { ...surfaceAccent, over: tokens.surface },
      4.5,
    ],
    // Outgoing bubble: primary text over the translucent accent surface,
    // which is itself composited over canvas.
    [
      `[${themeName}] outgoing text on outgoing`,
      tokens.textPrimary,
      { ...outgoingSurface, over: tokens.canvas },
      4.5,
    ],
    // Secondary accent is used for tinted chips/borders and short labels —
    // hold it to the large-text/non-text bar.
    [`[${themeName}] accent-2 on surface`, accent2, tokens.surface, 3.0],
  )
}

let failed = false
const rows = []

for (const [label, fg, bg, min, advisory = false] of checks) {
  const bgBackdrop = bg.over ? opaque(bg.over) : opaque(tokens.canvas)
  const bgLinear = resolveLinear(bg, bgBackdrop)
  const fgLinear = resolveLinear(fg, bgLinear)
  const ratio = contrastRatio(fgLinear, bgLinear)
  const pass = ratio >= min
  if (!pass && !advisory) failed = true
  rows.push({
    label,
    ratio: ratio.toFixed(2),
    min: min.toFixed(1),
    status: pass ? 'PASS' : advisory ? 'note' : 'FAIL',
  })
}

const pad = (s, n) => String(s).padEnd(n)
console.log(pad('pair', 38), pad('ratio', 8), pad('min', 6), 'status')
console.log('-'.repeat(62))
for (const r of rows) {
  console.log(pad(r.label, 38), pad(r.ratio, 8), pad(r.min, 6), r.status)
}

if (failed) {
  console.error(
    '\n✗ contrast gate FAILED — adjust token lightness in src/styles.css',
  )
  process.exit(1)
}
console.log('\n✓ contrast gate passed')
