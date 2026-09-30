import type { LatLng } from '@/lib/geo'
import {
  GLOBE_RADIUS,
  decodeLandDots,
  type GlobeRotation,
} from '@/features/landing/globe'

// Canvas 2D drawing for the landing globe. Imperative and client-only; the
// maths lives in `globe.ts`. Each frame projects every land dot with the
// angle-difference identities (no trigonometry per dot) and stamps a
// pre-rendered dot sprite, so a frame allocates nothing.

const RAD = Math.PI / 180

/** Land dot opacity on the face: `FRONT_BASE` at the rim, up to 0.95 at the centre. */
const FRONT_BASE = 0.3
const FRONT_DEPTH = 0.65
/** Land dots on the far side show through faintly, strongest opposite the viewer. */
const BACK_ALPHA = 0.1

type LandTrig = {
  count: number
  sinLat: Float32Array
  cosLat: Float32Array
  sinLng: Float32Array
  cosLng: Float32Array
}

let landTrig: LandTrig | null = null

/** Decoded once per page, on first draw. */
function getLandTrig(): LandTrig {
  if (landTrig) {
    return landTrig
  }
  const { lat, lng } = decodeLandDots()
  const count = lat.length
  const trig: LandTrig = {
    count,
    sinLat: new Float32Array(count),
    cosLat: new Float32Array(count),
    sinLng: new Float32Array(count),
    cosLng: new Float32Array(count),
  }
  for (let index = 0; index < count; index++) {
    trig.sinLat[index] = Math.sin(lat[index] * RAD)
    trig.cosLat[index] = Math.cos(lat[index] * RAD)
    trig.sinLng[index] = Math.sin(lng[index] * RAD)
    trig.cosLng[index] = Math.cos(lng[index] * RAD)
  }
  landTrig = trig
  return trig
}

/** A filled circle, pre-rendered at device resolution. */
function createDotSprite(radius: number, color: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas')
  const size = Math.ceil(radius * 2) + 2
  sprite.width = size
  sprite.height = size
  const context = sprite.getContext('2d')
  if (context) {
    context.fillStyle = color
    context.beginPath()
    context.arc(size / 2, size / 2, radius, 0, Math.PI * 2)
    context.fill()
  }
  return sprite
}

function readToken(element: Element, name: string): string {
  // Custom properties compute with their var() references resolved, so the
  // accent themes come through as plain oklch() colours.
  return getComputedStyle(element).getPropertyValue(name).trim()
}

export type GlobeRenderer = {
  /** Sizes the backing store to a square of `cssSize` CSS pixels. */
  resize(cssSize: number, devicePixelRatio: number): void
  /** Re-reads the colour tokens, e.g. after a theme change. */
  refreshPalette(): void
  /** Draws the globe facing `rotation`, with `cities` as brighter dots. */
  draw(rotation: GlobeRotation, cities: ReadonlyArray<LatLng>): void
}

/** A renderer for `canvas`, or null where there is no 2D context (jsdom). */
export function createGlobeRenderer(
  canvas: HTMLCanvasElement,
): GlobeRenderer | null {
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  let cssSize = 0
  let pixelRatio = 1
  let landColor = ''
  let cityColor = ''
  let landSprite: HTMLCanvasElement | null = null
  let citySprite: HTMLCanvasElement | null = null

  function rebuildSprites() {
    if (cssSize === 0) {
      return
    }
    // Dots grow with the globe but stay between ~1.8 and 2.8 CSS px wide.
    const landRadius = Math.min(
      Math.max(cssSize * GLOBE_RADIUS * 0.005, 0.9),
      1.4,
    )
    landSprite = createDotSprite(landRadius * pixelRatio, landColor)
    citySprite = createDotSprite(landRadius * 1.5 * pixelRatio, cityColor)
  }

  const stamp = (
    sprite: HTMLCanvasElement,
    x: number,
    y: number,
    scale: number,
  ) => {
    const size = sprite.width * scale
    context.drawImage(sprite, x - size / 2, y - size / 2, size, size)
  }

  return {
    resize(nextCssSize, devicePixelRatio) {
      const nextRatio = Math.min(Math.max(devicePixelRatio, 1), 2)
      if (nextCssSize === cssSize && nextRatio === pixelRatio) {
        return
      }
      cssSize = nextCssSize
      pixelRatio = nextRatio
      const pixels = Math.round(cssSize * pixelRatio)
      canvas.width = pixels
      canvas.height = pixels
      rebuildSprites()
    },

    refreshPalette() {
      landColor = readToken(canvas, '--lx-text-2') || 'currentcolor'
      cityColor = readToken(canvas, '--lx-text') || 'currentcolor'
      rebuildSprites()
    },

    draw(rotation, cities) {
      const { width, height } = canvas
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.globalAlpha = 1
      context.clearRect(0, 0, width, height)
      if (!landSprite || !citySprite || width === 0) {
        return
      }

      const radius = width * GLOBE_RADIUS
      const centreX = width / 2
      const centreY = height / 2
      const sinLambda0 = Math.sin(rotation.lambda * RAD)
      const cosLambda0 = Math.cos(rotation.lambda * RAD)
      const sinPhi0 = Math.sin(rotation.phi * RAD)
      const cosPhi0 = Math.cos(rotation.phi * RAD)
      const land = getLandTrig()

      // Far side first, then the face over it.
      for (let pass = 0; pass < 2; pass++) {
        const front = pass === 1
        for (let index = 0; index < land.count; index++) {
          const cosLat = land.cosLat[index]
          const sinLat = land.sinLat[index]
          // cos and sin of (lng - lambda0), from the angle-difference identities.
          const cosD =
            land.cosLng[index] * cosLambda0 + land.sinLng[index] * sinLambda0
          const sinD =
            land.sinLng[index] * cosLambda0 - land.cosLng[index] * sinLambda0
          const z = sinPhi0 * sinLat + cosPhi0 * cosLat * cosD
          if (front ? z < 0 : z >= 0) {
            continue
          }
          const x = centreX + radius * cosLat * sinD
          const y =
            centreY - radius * (cosPhi0 * sinLat - sinPhi0 * cosLat * cosD)
          if (front) {
            context.globalAlpha = FRONT_BASE + FRONT_DEPTH * z
            // Rim dots shrink a little, as the spacing foreshortens.
            stamp(landSprite, x, y, 0.7 + 0.3 * z)
          } else {
            context.globalAlpha = BACK_ALPHA * -z
            stamp(landSprite, x, y, 0.7)
          }
        }
      }

      for (let index = 0; index < cities.length; index++) {
        const city = cities[index]
        const lat = city.lat * RAD
        const dLng = city.lng * RAD - rotation.lambda * RAD
        const cosLat = Math.cos(lat)
        const sinLat = Math.sin(lat)
        const cosD = Math.cos(dLng)
        const z = sinPhi0 * sinLat + cosPhi0 * cosLat * cosD
        if (z <= 0) {
          continue
        }
        context.globalAlpha = 0.45 + 0.55 * z
        stamp(
          citySprite,
          centreX + radius * cosLat * Math.sin(dLng),
          centreY - radius * (cosPhi0 * sinLat - sinPhi0 * cosLat * cosD),
          1,
        )
      }
      context.globalAlpha = 1
    },
  }
}
