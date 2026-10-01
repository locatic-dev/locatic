import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Self-hosted fonts are wired in three places that cannot see each other:
// the @font-face rules in styles.css, the preload links in __root.tsx and the
// files in public/fonts. A renamed or deleted file fails silently in the
// browser (the fallback renders), so this keeps the three in step.

function read(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
}

const styles = read('src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '')
const root = read('src/routes/__root.tsx')
const fontsDir = new URL('../../../public/fonts/', import.meta.url)

function fontFaceUrls() {
  return [...styles.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map(
    ([, url]) => url,
  )
}

function preloadHrefs() {
  return [...root.matchAll(/'(\/fonts\/[^']+\.woff2)'/g)].map(([, url]) => url)
}

describe('self-hosted font contract', () => {
  it('points every @font-face at a file that ships in public/fonts', () => {
    const urls = fontFaceUrls()

    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(
        existsSync(new URL(`../../../public${url}`, import.meta.url)),
        `${url} is missing`,
      ).toBe(true)
    }
  })

  it('preloads exactly the faces styles.css declares', () => {
    expect([...preloadHrefs()].sort()).toEqual([...fontFaceUrls()].sort())
  })

  it('ships no font file that nothing references', () => {
    const shipped = readdirSync(fontsDir)
      .filter((name) => name.endsWith('.woff2'))
      .map((name) => `/fonts/${name}`)

    expect(shipped.sort()).toEqual([...fontFaceUrls()].sort())
  })

  it('leads the sans and mono stacks with Geist and ships its licence', () => {
    expect(styles).toMatch(/--font-sans:\s*'Geist',/)
    expect(styles).toMatch(/--font-mono:\s*'Geist Mono',/)
    expect(read('public/fonts/OFL.txt')).toContain('Geist')
  })
})
