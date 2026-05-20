export const SKIP_LINK_MODALITY_ATTRIBUTE = 'data-skip-link-modality'
export const SKIP_LINK_MODALITY_KEYBOARD = 'keyboard'
export const SKIP_LINK_DATA_ATTRIBUTE = 'skipLink'

export function isSkipLinkKeyboardTrigger(key: string) {
  return key === 'Tab'
}

export function enableSkipLinkKeyboardMode(doc: Document) {
  doc.documentElement.setAttribute(
    SKIP_LINK_MODALITY_ATTRIBUTE,
    SKIP_LINK_MODALITY_KEYBOARD,
  )
}

export function disableSkipLinkKeyboardMode(doc: Document) {
  doc.documentElement.removeAttribute(SKIP_LINK_MODALITY_ATTRIBUTE)
}

export function blurFocusedSkipLink(doc: Document) {
  const activeElement = doc.activeElement

  if (
    activeElement instanceof HTMLElement &&
    activeElement.dataset[SKIP_LINK_DATA_ATTRIBUTE] === 'true'
  ) {
    activeElement.blur()
  }
}

export function resetSkipLinkFocusState(doc: Document) {
  disableSkipLinkKeyboardMode(doc)
  blurFocusedSkipLink(doc)
}
