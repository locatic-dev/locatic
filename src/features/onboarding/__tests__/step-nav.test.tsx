// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StepNav } from '../components/onboarding-shell'

const NOTICE =
  "We'll email occasional Locatic updates. Turn them off any time in Settings."

describe('StepNav', () => {
  it('tells new members about update emails on the last step', () => {
    render(<StepNav isLast onContinue={vi.fn()} saving={false} />)
    expect(screen.getByText(NOTICE)).toBeTruthy()
  })

  it('leaves earlier steps without the notice', () => {
    render(<StepNav isLast={false} onContinue={vi.fn()} saving={false} />)
    expect(screen.queryByText(NOTICE)).toBeNull()
  })
})
