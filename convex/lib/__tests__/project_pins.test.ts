import { describe, expect, it } from 'vitest'

import { canPinProject } from '../project_pins'

describe('canPinProject', () => {
  it('only allows visible projects to be pinned', () => {
    expect(canPinProject({ locatic: { isVisible: true } } as any)).toBe(true)
    expect(canPinProject({ locatic: { isVisible: false } } as any)).toBe(false)
  })
})
