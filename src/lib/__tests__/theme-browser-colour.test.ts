import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { emailPalette } from '../../../convex/lib/emails/community_update'

// Browser chrome (theme-color meta, PWA manifest, favicon and touch icon
// backgrounds) and the community email cannot read CSS variables, so they
// carry the sRGB hex of the teal theme tokens. This keeps those copies from
// drifting away from src/styles.css.

function read(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
}

// OKLCH -> sRGB hex (Björn Ottosson's OKLab matrices, gamut clipped), the same
// maths scripts/check-contrast.mjs uses.
function oklchToHex(lightness: number, chroma: number, hue: number) {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${linear
    .map((channel) => {
      const x = Math.min(1, Math.max(0, channel))
      const encoded =
        x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
      return Math.round(encoded * 255)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')}`
}

const css = read('src/styles.css')

/** Every value declared for a custom property, in stylesheet order. */
function declarations(source: string, name: string) {
  return [
    ...source.matchAll(new RegExp(`(?:^|[\\s;{])${name}:\\s*([^;]+);`, 'gm')),
  ].map((match) => match[1].trim())
}

/**
 * A neutral token as hex. It must be declared once, so a later override or a
 * per-theme copy cannot change the colour without failing here.
 */
function tokenHex(name: string) {
  const values = declarations(css, name)
  expect(values, `${name} declarations`).toHaveLength(1)
  const match = values[0].match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/)
  if (!match) throw new Error(`${name} is not a literal oklch() colour`)
  const [, lightness, chroma, hue] = match
  return oklchToHex(Number(lightness) / 100, Number(chroma), Number(hue))
}

/** `--primary` built from the teal (default) theme's accent components. */
function accentHex() {
  expect(declarations(css, '--primary')).toEqual([
    'oklch(var(--lx-accent-l) var(--lx-accent-c) var(--lx-accent-h))',
  ])
  const start = css.indexOf("[data-theme='teal'] {")
  if (start === -1) throw new Error('teal theme block not found')
  const teal = css.slice(start, css.indexOf('\n}', start))
  const component = (name: string) => {
    const values = declarations(teal, `--lx-accent-${name}`)
    expect(values, `teal --lx-accent-${name} declarations`).toHaveLength(1)
    return Number.parseFloat(values[0])
  }
  return oklchToHex(component('l') / 100, component('c'), component('h'))
}

describe('browser chrome colour', () => {
  it('uses the canvas token colour for theme-color, manifest and favicon', () => {
    const canvas = tokenHex('--background')

    const manifest = JSON.parse(read('public/manifest.json')) as {
      theme_color: string
      background_color: string
    }
    expect(manifest.theme_color.toLowerCase()).toBe(canvas)
    expect(manifest.background_color.toLowerCase()).toBe(canvas)

    const themeColorMeta = read('src/routes/__root.tsx').match(
      /name: 'theme-color', content: '(#[0-9a-fA-F]{6})'/,
    )
    expect(themeColorMeta?.[1].toLowerCase()).toBe(canvas)

    const faviconBackground = read('public/favicon.svg').match(
      /<rect[^>]*fill="(#[0-9a-fA-F]{6})"/,
    )
    expect(faviconBackground?.[1].toLowerCase()).toBe(canvas)
  })
})

describe('community email palette', () => {
  it('uses the teal theme token colours', () => {
    expect(emailPalette).toEqual({
      background: tokenHex('--background'),
      line: tokenHex('--border'),
      text: tokenHex('--foreground'),
      muted: tokenHex('--muted-foreground'),
      accent: accentHex(),
    })
  })
})
