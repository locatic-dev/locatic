// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '../sonner'

// jsdom rewrites import.meta.url, so resolve from the repository root.
const styles = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8')

async function renderToaster() {
  render(<Toaster />)
  act(() => {
    toast('unfollowed @ada', { action: { label: 'undo', onClick: vi.fn() } })
  })
  const toaster = await vi.waitFor(() => {
    const element = document.querySelector<HTMLElement>('[data-sonner-toaster]')
    if (!element) throw new Error('toaster not mounted')
    return element
  })
  return toaster
}

describe('Toaster', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    act(() => {
      toast.dismiss()
    })
    cleanup()
    vi.unstubAllGlobals()
  })

  it('is always dark and anchored bottom-centre', async () => {
    const toaster = await renderToaster()

    expect(toaster.dataset.sonnerTheme).toBe('dark')
    expect(toaster.dataset.yPosition).toBe('bottom')
    expect(toaster.dataset.xPosition).toBe('center')
  })

  it('paints toasts from the Locatic surface and text tokens', async () => {
    const toaster = await renderToaster()

    expect(toaster.style.getPropertyValue('--normal-bg')).toBe(
      'var(--lx-surface-raised)',
    )
    expect(toaster.style.getPropertyValue('--normal-border')).toBe(
      'var(--lx-border-strong)',
    )
    expect(toaster.style.getPropertyValue('--normal-text')).toBe(
      'var(--lx-text)',
    )
  })

  it('sits above the mobile tab bar on narrow screens', async () => {
    const toaster = await renderToaster()

    expect(toaster.style.getPropertyValue('--mobile-offset-bottom')).toBe(
      'calc(var(--lx-mobile-tab-height) + 8px)',
    )
    expect(toaster.style.getPropertyValue('--offset-bottom')).toBe(
      'var(--lx-toast-offset-bottom)',
    )
    // 601–767px: the tab bar is visible but Sonner uses its desktop offset.
    expect(styles).toMatch(
      /@media \(max-width: 767px\) \{\s*:root \{\s*--lx-toast-offset-bottom: calc\(var\(--lx-mobile-tab-height\) \+ 8px\);/,
    )
  })

  it('gives the toast action a visible focus outline and a touch-sized target', () => {
    expect(styles).toMatch(
      /\[data-sonner-toaster\] \[data-sonner-toast\] \[data-button\]:focus-visible \{\s*outline: 2px solid var\(--lx-focus\);/,
    )
    expect(styles).toMatch(
      /@media \(pointer: coarse\) \{\s*\[data-sonner-toaster\] \[data-sonner-toast\] \[data-button\] \{\s*min-height: 44px;/,
    )
  })
})
