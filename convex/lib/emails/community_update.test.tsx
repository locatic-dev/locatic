import { render } from '@react-email/render'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import {
  CommunityUpdateEmail,
  RESEND_UNSUBSCRIBE_PLACEHOLDER,
  renderCommunityUpdateText,
} from './community_update'

const base = {
  subject: 'builders < ship',
  preheader: 'safe & useful',
  introduction: '<script>alert(1)</script> hello',
  projects: [],
  discussions: [],
  shippingUpdate: '',
}

describe('community update email', () => {
  it('renders announcement-only content with escaped text and unsubscribe placeholder', async () => {
    const html = await render(
      createElement(CommunityUpdateEmail, { content: base }),
    )
    const text = renderCommunityUpdateText(base)

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain(RESEND_UNSUBSCRIBE_PLACEHOLDER)
    expect(text).toContain(RESEND_UNSUBSCRIBE_PLACEHOLDER)
    expect(html).not.toContain('projects worth a look')
  })
})
