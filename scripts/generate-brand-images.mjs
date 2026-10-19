#!/usr/bin/env node
// Social preview image and raster app icons.
//
// Run: pnpm brand:images
//
// Writes, in public/:
//   og-image.png            1200x630 social preview (og:image, twitter:image)
//   favicon.ico             16/32/48 PNG-in-ICO fallback for old browsers
//   favicon-32.png          PNG fallback next to favicon.svg
//   apple-touch-icon.png    180x180, full bleed (iOS rounds it)
//   icon-192.png            manifest icon
//   icon-512.png            manifest icon
//   icon-maskable-512.png   manifest maskable icon (mark inside the safe zone)
//
// Renders HTML with headless Chromium from the Playwright devDependency, so
// the preview uses the real Geist files from public/fonts and the same land
// dots and orthographic projection as the landing globe
// (src/features/landing/globe.ts). Colours are the teal theme tokens from
// src/styles.css; nothing here ships to the client.

import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { LAND_BITS, LAND_GRID_STEP } from '../src/lib/land-dots.ts'

const PUBLIC = new URL('../public/', import.meta.url)
const RAD = Math.PI / 180

// Keep in sync with MARK_PATH in src/components/ui/logo.tsx.
const MARK_PATH =
  'M12 2.2C7.45 2.2 3.8 5.85 3.8 10.4c0 5.3 6.55 10.85 7.55 11.65a1.05 1.05 0 0 0 1.3 0C13.65 21.25 20.2 15.7 20.2 10.4 20.2 5.85 16.55 2.2 12 2.2ZM10.9 7.6h2.2a1.6 1.6 0 0 1 1.5 1.5v2.2a1.6 1.6 0 0 1-1.5 1.5h-2.2a1.6 1.6 0 0 1-1.5-1.5V9.1a1.6 1.6 0 0 1 1.5-1.5Z'

// Teal theme tokens (src/styles.css). Chromium renders oklch() directly.
const color = {
  bg: 'oklch(14.5% 0.003 250)',
  surface: 'oklch(19% 0.004 250)',
  border: 'oklch(29% 0.004 250)',
  text: 'oklch(94% 0.003 250)',
  text2: 'oklch(72% 0.004 250)',
  accent: 'oklch(76% 0.17 195)',
  place: 'oklch(78% 0.14 65)',
}

// Icons copy public/favicon.svg's colours, which
// src/lib/__tests__/theme-browser-colour.test.ts keeps in step with the tokens.
const faviconSvg = readFileSync(new URL('favicon.svg', PUBLIC), 'utf8')
const iconColor = {
  bg: faviconSvg.match(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/)[1],
  mark: faviconSvg.match(/<path[^>]*fill="(#[0-9a-fA-F]{6})"/)[1],
}

function fontFace(family, file) {
  const data = readFileSync(new URL(`fonts/${file}`, PUBLIC)).toString('base64')
  return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:100 900;font-display:block}`
}

/** Same grid walk as decodeLandDots in src/features/landing/globe.ts. */
function decodeLandDots() {
  const binary = atob(LAND_BITS)
  const dots = []
  const rows = Math.round(180 / LAND_GRID_STEP)
  let bit = 0
  for (let row = 0; row < rows; row++) {
    const lat = 90 - (row + 0.5) * LAND_GRID_STEP
    const count = Math.max(
      1,
      Math.round((360 * Math.cos(lat * RAD)) / LAND_GRID_STEP),
    )
    for (let index = 0; index < count; index++, bit++) {
      if (binary.charCodeAt(bit >> 3) & (1 << (bit & 7))) {
        dots.push({ lat, lng: -180 + ((index + 0.5) * 360) / count })
      }
    }
  }
  return dots
}

/** Same projection as projectToGlobe in src/features/landing/globe.ts. */
function project({ lat, lng }, rotation) {
  const phi = lat * RAD
  const dLambda = (lng - rotation.lambda) * RAD
  const phi0 = rotation.phi * RAD
  const cosPhi = Math.cos(phi)
  return {
    x: cosPhi * Math.sin(dLambda),
    y: -(
      Math.cos(phi0) * Math.sin(phi) -
      Math.sin(phi0) * cosPhi * Math.cos(dLambda)
    ),
    z:
      Math.sin(phi0) * Math.sin(phi) +
      Math.cos(phi0) * cosPhi * Math.cos(dLambda),
  }
}

// --- Social preview -------------------------------------------------------

const OG = { width: 1200, height: 630 }
const GLOBE = { cx: 868, cy: 336, r: 252 }
// Looks down on the North Atlantic from high above, so San Francisco,
// Berlin and Bengaluru are all on the visible face at once.
const ROTATION = { lambda: -14, phi: 64 }
// Example activity for the preview: realistic, not real users or repos.
// `card` places the card's corner relative to the pin.
const ACTIVE_CITIES = [
  {
    name: 'san francisco',
    lat: 37.77,
    lng: -122.42,
    action: 'released v2.4.0',
    repo: 'tidepool/edge-kv',
    card: { dx: -36, dy: -122, align: 'left' },
  },
  {
    name: 'berlin',
    lat: 52.52,
    lng: 13.4,
    action: 'started a project',
    repo: 'mira/fjord-ui',
    card: { dx: -30, dy: 36, align: 'left' },
  },
  {
    name: 'bengaluru',
    lat: 12.97,
    lng: 77.59,
    action: 'shipped a release',
    repo: 'kavya/chai-db v1.0',
    card: { dx: -22, dy: -122, align: 'right' },
  },
]
// Quieter dots: other cities on the network.
const OTHER_CITIES = [
  { lat: 40.71, lng: -74.01 }, // new york
  { lat: 43.65, lng: -79.38 }, // toronto
  { lat: 51.51, lng: -0.13 }, // london
  { lat: 59.33, lng: 18.07 }, // stockholm
  { lat: 41.01, lng: 28.98 }, // istanbul
  { lat: 25.2, lng: 55.27 }, // dubai
  { lat: 6.52, lng: 3.38 }, // lagos
]

function toCanvas(point) {
  return {
    x: GLOBE.cx + point.x * GLOBE.r,
    y: GLOBE.cy + point.y * GLOBE.r,
  }
}

function globeSvg() {
  const land = decodeLandDots()
    .map((dot) => project(dot, ROTATION))
    .filter((point) => point.z > 0)
    .map((point) => {
      const { x, y } = toCanvas(point)
      // Brighter towards the centre of the disc, like the landing renderer.
      const opacity = (0.22 + 0.6 * point.z).toFixed(2)
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill-opacity="${opacity}"/>`
    })
    .join('')

  const place = (city) => ({ ...city, ...toCanvas(project(city, ROTATION)) })
  const active = ACTIVE_CITIES.map(place)
  const others = OTHER_CITIES.map(place)

  const quietPins = others
    .map(
      (city) =>
        `<circle cx="${city.x.toFixed(1)}" cy="${city.y.toFixed(1)}" r="3.5" fill="${color.accent}" fill-opacity="0.5"/>`,
    )
    .join('')
  const activePins = active
    .map((city) => {
      const x = city.x.toFixed(1)
      const y = city.y.toFixed(1)
      return `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${color.accent}" stroke-opacity="0.55" stroke-width="1.5"/>
        <circle cx="${x}" cy="${y}" r="30" fill="none" stroke="${color.accent}" stroke-opacity="0.2" stroke-width="1.5"/>
        <circle cx="${x}" cy="${y}" r="6" fill="${color.accent}"/>`
    })
    .join('')

  const svg = `<svg class="globe" width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}" aria-hidden="true">
    <circle cx="${GLOBE.cx}" cy="${GLOBE.cy}" r="${GLOBE.r}" fill="none" stroke="${color.border}" stroke-width="1"/>
    <g fill="${color.text2}">${land}</g>
    ${quietPins}
    ${activePins}
  </svg>`

  // One activity card per active city, hung off its pin.
  const cards = active
    .map(({ x, y, name, action, repo, card }) => {
      const left = (x + card.dx).toFixed(0)
      const top = (y + card.dy).toFixed(0)
      const shift = card.align === 'right' ? 'transform:translateX(-100%);' : ''
      return `<div class="card" style="left:${left}px;top:${top}px;${shift}">
        <span class="card-place">${name}</span>
        <span class="card-text">${action}</span>
        <span class="card-repo">${repo}</span>
      </div>`
    })
    .join('')

  return svg + cards
}

function ogHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${fontFace('Geist', 'geist-latin-wght.woff2')}
    ${fontFace('Geist Mono', 'geist-mono-latin-wght.woff2')}
    *{box-sizing:border-box;margin:0}
    html,body{width:${OG.width}px;height:${OG.height}px;background:${color.bg};overflow:hidden}
    body{position:relative;font-family:'Geist',sans-serif;color:${color.text};-webkit-font-smoothing:antialiased}
    .frame{position:absolute;inset:20px;border:1px solid ${color.border};border-radius:6px}
    .clip{position:absolute;inset:20px;border-radius:6px;overflow:hidden}
    .globe{position:absolute;left:-20px;top:-20px}
    .copy{position:absolute;left:76px;top:72px;bottom:72px;width:560px;display:flex;flex-direction:column}
    .brand{display:flex;align-items:center;gap:12px;font-weight:600;font-size:34px;letter-spacing:-0.04em}
    .brand svg{color:${color.accent}}
    .eyebrow{margin-top:auto;font-family:'Geist Mono',monospace;font-size:20px;color:${color.place}}
    h1{margin-top:18px;font-weight:600;font-size:96px;line-height:0.98;letter-spacing:-0.045em}
    h1 em{font-style:normal;color:${color.accent}}
    .sub{margin-top:26px;max-width:470px;font-size:26px;line-height:1.35;letter-spacing:-0.01em;color:${color.text2}}
    .url{margin-top:auto;font-family:'Geist Mono',monospace;font-size:20px;color:${color.text2}}
    .url b{font-weight:400;color:${color.accent}}
    .card{position:absolute;margin:-20px 0 0 -20px;display:flex;flex-direction:column;gap:4px;padding:10px 14px;background:${color.surface};border:1px solid ${color.border};border-radius:6px;font-family:'Geist Mono',monospace;font-size:16px;white-space:nowrap}
    .card-place{color:${color.place}}
    .card-text{color:${color.text}}
    .card-repo{color:${color.text2}}
  </style></head><body>
    <div class="clip">${globeSvg()}</div>
    <div class="frame"></div>
    <div class="copy">
      <div class="brand">
        <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="${MARK_PATH}"/></svg>
        locatic
      </div>
      <p class="eyebrow">// for builders who ship</p>
      <h1>github,<br>with a <em>map.</em></h1>
      <p class="sub">discover devs &amp; projects from your city to anywhere on the globe.</p>
      <p class="url"><b>$</b> locatic.dev</p>
    </div>
  </body></html>`
}

// --- Icons ----------------------------------------------------------------

/**
 * The pin mark on the canvas colour. `markScale` is the mark's share of the
 * icon width; `radius` rounds the corners (0 for full bleed icons that the
 * platform masks itself).
 */
function iconHtml(size, { markScale, radius }) {
  const mark = size * markScale
  return `<!doctype html><html><head><style>
    *{margin:0}html,body{width:${size}px;height:${size}px;background:transparent;overflow:hidden}
    div{width:${size}px;height:${size}px;display:grid;place-items:center;background:${iconColor.bg};border-radius:${radius * size}px}
  </style></head><body><div>
    <svg width="${mark}" height="${mark}" viewBox="0 0 24 24"><path fill="${iconColor.mark}" fill-rule="evenodd" clip-rule="evenodd" d="${MARK_PATH}"/></svg>
  </div></body></html>`
}

// public/favicon.svg: a 512 square, rx 128, mark scaled 12.5 (300px of 512).
const FAVICON = { markScale: 300 / 512, radius: 128 / 512 }
const FULL_BLEED = { markScale: 300 / 512, radius: 0 }
// Maskable icons keep content inside the central 80% circle.
const MASKABLE = { markScale: 0.56, radius: 0 }

/** An ICO file holding PNG images (supported since Windows Vista). */
function toIco(images) {
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((image) => image.png)])
}

// --- Render ---------------------------------------------------------------

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })

  async function render(html, width, height) {
    await page.setViewportSize({ width, height })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    return page.screenshot({ type: 'png', omitBackground: true })
  }

  function write(name, buffer) {
    writeFileSync(new URL(name, PUBLIC), buffer)
    console.log(`${name.padEnd(24)} ${(buffer.length / 1024).toFixed(1)} KiB`)
  }

  write('og-image.png', await render(ogHtml(), OG.width, OG.height))

  const icon = (size, options) => render(iconHtml(size, options), size, size)
  const ico = []
  for (const size of [16, 32, 48]) {
    ico.push({ size, png: await icon(size, FAVICON) })
  }
  write('favicon.ico', toIco(ico))
  write('favicon-32.png', ico[1].png)
  write('apple-touch-icon.png', await icon(180, FULL_BLEED))
  write('icon-192.png', await icon(192, FAVICON))
  write('icon-512.png', await icon(512, FAVICON))
  write('icon-maskable-512.png', await icon(512, MASKABLE))
} finally {
  await browser.close()
}
