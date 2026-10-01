import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BUILD_STATUS, StatusPill } from '../status-pill'

describe('StatusPill', () => {
  it.each(Object.entries(BUILD_STATUS))(
    'renders the readable label for %s',
    (status, metadata) => {
      const html = renderToStaticMarkup(createElement(StatusPill, { status }))
      expect(html).toContain(metadata.label)
    },
  )

  it('keeps an unfamiliar status readable during rolling deployments', () => {
    const html = renderToStaticMarkup(
      createElement(StatusPill, { status: 'mentoring' }),
    )
    expect(html).toContain('mentoring')
  })
})
