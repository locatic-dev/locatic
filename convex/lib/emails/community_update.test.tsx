// @vitest-environment jsdom
import { render } from '@react-email/render'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import type { EmailCampaignContent } from '../email_campaigns'
import {
  CommunityUpdateEmail,
  emailPalette,
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

const populated: EmailCampaignContent = {
  ...base,
  projects: [
    {
      projectId: 'project-1' as Id<'projects'>,
      name: 'compiler',
      fullName: 'grace/compiler',
      description: 'A tiny compiler.',
      url: 'https://locatic.dev/p/grace/compiler',
      activityAt: 0,
      activityLabel: 'released v1.2',
    },
  ],
  discussions: [
    {
      commentId: 'comment-1' as Id<'comments'>,
      title: 'Monorepo or not?',
      url: 'https://locatic.dev/p/grace/compiler#comment-1',
      summary: 'A thread on repo layout.',
    },
  ],
  shippingUpdate: 'City pages show live builders.',
}

async function renderDocument(content: EmailCampaignContent) {
  const html = await render(createElement(CommunityUpdateEmail, { content }))
  return new DOMParser().parseFromString(html, 'text/html')
}

function style(element: Element | null | undefined) {
  return element?.getAttribute('style') ?? ''
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

  it('repeats the dark background on the visible wrapper because Gmail drops body styles', async () => {
    const document = await renderDocument(base)
    const background = `background-color:${emailPalette.background}`
    const wrapper = document.querySelector('main')?.parentElement

    expect(
      document
        .querySelector('meta[name="color-scheme"]')
        ?.getAttribute('content'),
    ).toBe('dark')
    expect(style(document.body)).toContain(background)
    expect(wrapper).not.toBe(document.body)
    expect(style(wrapper)).toContain(background)
    expect(style(wrapper)).not.toContain('display:none')
  })

  it('uses the app type roles: sans subject, eyebrow section headings, accent links', async () => {
    const document = await renderDocument(populated)
    const headings = [...document.querySelectorAll('h2')]

    expect(style(document.querySelector('h1'))).toContain(
      'font-family:Arial, Helvetica, sans-serif',
    )
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'projects worth a look',
      'discussions',
      'what changed in locatic',
    ])
    for (const heading of headings) {
      expect(style(heading)).toContain('text-transform:uppercase')
      expect(style(heading)).toContain('font-size:11px')
      expect(style(heading)).toContain(`color:${emailPalette.muted}`)
    }
    const links = [...document.querySelectorAll('a')]
    expect(links).toHaveLength(3)
    for (const link of links) {
      expect(style(link)).toContain(`color:${emailPalette.accent}`)
    }
  })
})
