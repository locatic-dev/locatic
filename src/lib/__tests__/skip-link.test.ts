// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import {
  SKIP_LINK_MODALITY_ATTRIBUTE,
  SKIP_LINK_MODALITY_KEYBOARD,
  blurFocusedSkipLink,
  disableSkipLinkKeyboardMode,
  enableSkipLinkKeyboardMode,
  isSkipLinkKeyboardTrigger,
  resetSkipLinkFocusState,
} from '../skip-link'

describe('skip link focus helpers', () => {
  it('treats Tab as the keyboard trigger for revealing the skip link', () => {
    expect(isSkipLinkKeyboardTrigger('Tab')).toBe(true)
    expect(isSkipLinkKeyboardTrigger('Escape')).toBe(false)
  })

  it('stores keyboard modality on the document root', () => {
    enableSkipLinkKeyboardMode(document)

    expect(
      document.documentElement.getAttribute(SKIP_LINK_MODALITY_ATTRIBUTE),
    ).toBe(SKIP_LINK_MODALITY_KEYBOARD)

    disableSkipLinkKeyboardMode(document)

    expect(
      document.documentElement.hasAttribute(SKIP_LINK_MODALITY_ATTRIBUTE),
    ).toBe(false)
  })

  it('blurs the skip link when focus was restored there externally', () => {
    document.body.innerHTML =
      '<a href="#main-content" data-skip-link="true">Skip</a><main id="main-content"></main>'
    const skipLink = document.querySelector('a')

    expect(skipLink).toBeInstanceOf(HTMLElement)

    skipLink?.focus()
    expect(document.activeElement).toBe(skipLink)

    blurFocusedSkipLink(document)

    expect(document.activeElement).not.toBe(skipLink)
  })

  it('clears stale keyboard modality and skip-link focus together', () => {
    document.body.innerHTML =
      '<a href="#main-content" data-skip-link="true">Skip</a><main id="main-content"></main>'
    const skipLink = document.querySelector('a')

    enableSkipLinkKeyboardMode(document)
    skipLink?.focus()

    resetSkipLinkFocusState(document)

    expect(
      document.documentElement.hasAttribute(SKIP_LINK_MODALITY_ATTRIBUTE),
    ).toBe(false)
    expect(document.activeElement).not.toBe(skipLink)
  })
})
