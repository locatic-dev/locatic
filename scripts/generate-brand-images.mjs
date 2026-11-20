#!/usr/bin/env node
// Raster app icons.
//
// Run: pnpm brand:images
//
// Writes, in public/:
//   favicon.ico             16/32/48 PNG-in-ICO fallback for old browsers
//   favicon-32.png          PNG fallback next to favicon.svg
//   apple-touch-icon.png    180x180, full bleed (iOS rounds it)
//   icon-192.png            manifest icon
//   icon-512.png            manifest icon
//   icon-maskable-512.png   manifest maskable icon (mark inside the safe zone)
//
// Uses Playwright to render the icons in headless Chromium.

import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const PUBLIC = new URL('../public/', import.meta.url)

// Keep in sync with MARK_PATH in src/components/ui/logo.tsx.
const MARK_PATH =
  'M12 2.2C7.45 2.2 3.8 5.85 3.8 10.4c0 5.3 6.55 10.85 7.55 11.65a1.05 1.05 0 0 0 1.3 0C13.65 21.25 20.2 15.7 20.2 10.4 20.2 5.85 16.55 2.2 12 2.2ZM10.9 7.6h2.2a1.6 1.6 0 0 1 1.5 1.5v2.2a1.6 1.6 0 0 1-1.5 1.5h-2.2a1.6 1.6 0 0 1-1.5-1.5V9.1a1.6 1.6 0 0 1 1.5-1.5Z'

// Icons copy public/favicon.svg's colours, which
// src/lib/__tests__/theme-browser-colour.test.ts keeps in step with the tokens.
const faviconSvg = readFileSync(new URL('favicon.svg', PUBLIC), 'utf8')
const iconColor = {
  bg: faviconSvg.match(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/)[1],
  mark: faviconSvg.match(/<path[^>]*fill="(#[0-9a-fA-F]{6})"/)[1],
}

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
