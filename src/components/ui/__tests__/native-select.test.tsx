// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NativeSelect } from '../native-select'

describe('NativeSelect', () => {
  it('stays a labelled native select with a decorative chevron', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(
      <>
        <label htmlFor="status">Status</label>
        <NativeSelect id="status" defaultValue="" onChange={onChange}>
          <option value="">all</option>
          <option value="failed">failed</option>
        </NativeSelect>
      </>,
    )

    const select = screen.getByRole('combobox', { name: 'Status' })
    await user.selectOptions(select, 'failed')
    expect((select as HTMLSelectElement).value).toBe('failed')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })
})
