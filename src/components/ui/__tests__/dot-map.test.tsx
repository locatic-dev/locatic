// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DotMap, isMaskLandCell, projectToMaskCell } from '../dot-map'

const BENGALURU = { id: 'bengaluru-in', lat: 12.9716, lng: 77.5946 }
const MYSURU = { id: 'mysuru-in', lat: 12.2958, lng: 76.6394 }
const LONDON = { id: 'london-gb', lat: 51.5074, lng: -0.1278 }
const SAN_FRANCISCO = { id: 'san-francisco-us', lat: 37.7749, lng: -122.4194 }

function pinCircles(container: HTMLElement, key: string) {
  return container.querySelectorAll(`[data-map-pin="${key}"] > circle`)
}

describe('projectToMaskCell', () => {
  it('places Bengaluru on the Indian land cell of the mask', () => {
    const cell = projectToMaskCell(BENGALURU)

    expect(cell).toEqual({ row: 6, col: 32 })
    expect(isMaskLandCell(cell)).toBe(true)
  })

  it('puts other reference cities on land, west to east', () => {
    const cells = [SAN_FRANCISCO, LONDON, BENGALURU].map(projectToMaskCell)

    expect(cells.every(isMaskLandCell)).toBe(true)
    const columns = cells.map((cell) => cell.col)
    expect(columns).toEqual([...columns].sort((a, b) => a - b))
  })
})

describe('DotMap', () => {
  it('draws the focus on its mask dot, with the ping, above its neighbours', () => {
    // 43 x 15 mask cells at 10px each: cell (6, 32) is centred at (325, 65).
    const { container } = render(
      <DotMap
        width={430}
        height={150}
        focus={BENGALURU}
        points={[MYSURU]}
        label="Bengaluru and 1 nearby city"
      />,
    )

    const pins = [...container.querySelectorAll('[data-map-pin]')]
    expect(pins.map((pin) => pin.getAttribute('data-map-pin'))).toEqual([
      'mysuru-in',
      'bengaluru-in',
    ])
    const [halo] = pinCircles(container, 'bengaluru-in')
    expect(halo?.getAttribute('cx')).toBe('325')
    expect(halo?.getAttribute('cy')).toBe('65')
    // Only the focus pings (an animated ring).
    expect(
      container.querySelectorAll('[data-map-pin="bengaluru-in"] animate'),
    ).not.toHaveLength(0)
    expect(
      container.querySelectorAll('[data-map-pin="mysuru-in"] animate'),
    ).toHaveLength(0)
    expect(
      screen.getByRole('img', { name: 'Bengaluru and 1 nearby city' }),
    ).toBeTruthy()
  })

  it('keeps the landing example pins and stays decorative by default', () => {
    const { container } = render(<DotMap />)

    expect(container.querySelectorAll('[data-map-pin]')).toHaveLength(7)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('plots nothing but the mask for an empty data set', () => {
    const { container } = render(<DotMap points={[]} focus={null} />)

    expect(container.querySelectorAll('[data-map-pin]')).toHaveLength(0)
  })
})
