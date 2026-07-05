#!/usr/bin/env node
// WCAG contrast gate for the Locatic token scale.
//
// Self-contained OKLCH -> sRGB conversion (no deps) + WCAG 2.x contrast ratio.
// Run: node scripts/check-contrast.mjs
//
// Asserts the contrast pairs that matter after the contrast/token pass. Body
// text must clear 4.5:1; large text / non-text metadata must clear 3:1.

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

// ── Token values (keep in sync with src/styles.css) ─────────────────────────
const tokens = {
  canvas: { L: 0.135, C: 0.007, h: 230 },
  surface: { L: 0.2, C: 0.008, h: 230 },
  surfaceRaised: { L: 0.24, C: 0.01, h: 230 },
  textPrimary: { L: 0.93, C: 0.005, h: 230 },
  textSecondary: { L: 0.68, C: 0.006, h: 230 },
  textTertiary: { L: 0.58, C: 0.006, h: 230 },
  textDisabled: { L: 0.43, C: 0.005, h: 230 },
  brand: { L: 0.72, C: 0.15, h: 195 },
  brandForeground: { L: 0.14, C: 0.005, h: 230 },
  selectedFill: { L: 0.72, C: 0.15, h: 195, alpha: 0.1 },
  surfaceAccent: { L: 0.72, C: 0.15, h: 195, alpha: 0.06 },
  outgoingSurface: { L: 0.72, C: 0.15, h: 195, alpha: 0.16 },
  liked: { L: 0.64, C: 0.21, h: 25 },
}

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
  [
    'brand-foreground on brand (CTA)',
    tokens.brandForeground,
    tokens.brand,
    4.5,
  ],
  ['liked on surface', tokens.liked, tokens.surface, 4.5],
  [
    'brand on selected-fill',
    tokens.brand,
    { ...tokens.selectedFill, over: tokens.surface },
    4.5,
  ],
  [
    'primary on surface-accent hover',
    tokens.textPrimary,
    { ...tokens.surfaceAccent, over: tokens.surface },
    4.5,
  ],
  // Outgoing bubble: primary text over the translucent teal surface, which is
  // itself composited over canvas.
  [
    'outgoing text on outgoing-surface',
    tokens.textPrimary,
    { ...tokens.outgoingSurface, over: tokens.canvas },
    4.5,
  ],
]

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
