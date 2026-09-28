import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Browser chrome (theme-color meta, PWA manifest, favicon and touch icon
// backgrounds) cannot read CSS variables, so it carries the sRGB hex of the
// canvas token. This keeps those copies from drifting into different blacks.

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

function canvasHex() {
  const match = read('src/styles.css').match(
    /--background:\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/,
  )
  if (!match) throw new Error('--background oklch() token not found')
  const [, lightness, chroma, hue] = match
  return oklchToHex(Number(lightness) / 100, Number(chroma), Number(hue))
}

describe('browser chrome colour', () => {
  it('uses the canvas token colour for theme-color, manifest and favicon', () => {
    const canvas = canvasHex()

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
