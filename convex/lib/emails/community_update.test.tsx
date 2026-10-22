// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import type { Id } from '../../_generated/dataModel'
import {
  type CommunityUpdateProps,
  emailPalette,
  UNSUBSCRIBE_URL_PLACEHOLDER,
} from './community_update'
import { renderCampaignHtml, renderCampaignText } from './render'

const base: CommunityUpdateProps = {
  subject: 'builders < ship',
  preheader: 'safe & useful',
  content: {
    kind: 'announcement',
    body: 'Hello **builders**.\n\nRead [the notes](https://x.dev/notes).\n\n- maps\n- feeds',
    cta: null,
  },
  siteUrl: 'https://locatic.test',
  postalAddress: null,
}

const digest: CommunityUpdateProps = {
  ...base,
  content: {
    kind: 'digest',
    body: 'City pages show live builders.',
    cta: null,
    periodKey: 'manual:test',
    periodStart: 0,
    periodEnd: 0,
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
  },
}

function withBody(body: string): CommunityUpdateProps {
  return { ...base, content: { kind: 'announcement', body, cta: null } }
}

async function renderDocument(props: CommunityUpdateProps) {
  const html = await renderCampaignHtml(props)
  return new DOMParser().parseFromString(html, 'text/html')
}

function style(element: Element | null | undefined) {
  return element?.getAttribute('style') ?? ''
}

function hrefs(document: Document) {
  return [...document.querySelectorAll('a')].map((link) =>
    link.getAttribute('href'),
  )
}

describe('community update email', () => {
  it('renders the Markdown subset as email-safe elements', async () => {
    const document = await renderDocument(base)

    expect(document.querySelector('strong')?.textContent).toBe('builders')
    expect(hrefs(document)).toContain('https://x.dev/notes')
    expect(
      [...document.querySelectorAll('li')].map((item) => item.textContent),
    ).toEqual(['maps', 'feeds'])
    expect(
      style(document.querySelector('a[href="https://x.dev/notes"]')),
    ).toContain(`color:${emailPalette.accent}`)
  })

  it('drops unsafe links, raw HTML and images', async () => {
    const html = await renderCampaignHtml(
      withBody(
        '[bad](http://x.dev) [js](javascript:alert(1)) <script>alert(1)</script> <img src="https://x.dev/a.png"> ![pic](https://x.dev/b.png)',
      ),
    )
    const document = new DOMParser().parseFromString(html, 'text/html')

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('http://x.dev')
    expect(html).not.toContain('javascript:')
    expect(document.body.textContent).toContain('bad')
    expect(document.body.textContent).toContain('js')
  })

  it('escapes the subject and preheader', async () => {
    const html = await renderCampaignHtml(base)
    expect(html).toContain('builders &lt; ship')
    expect(html).toContain('safe &amp; useful')
  })

  it('lets the body link to the reader’s own unsubscribe URL', async () => {
    const document = await renderDocument(
      withBody(
        'You get this because you have an account. [Unsubscribe](' +
          UNSUBSCRIBE_URL_PLACEHOLDER +
          ') any time.',
      ),
    )
    expect(
      hrefs(document).filter((href) => href === UNSUBSCRIBE_URL_PLACEHOLDER),
    ).toHaveLength(2)
  })

  it('renders the call to action only when present', async () => {
    const without = await renderDocument(base)
    expect(without.querySelector('table[role="presentation"] a')).toBeNull()

    const document = await renderDocument({
      ...base,
      content: {
        kind: 'announcement',
        body: 'Hello',
        cta: { label: 'Open Locatic', url: 'https://locatic.test/home' },
      },
    })
    const button = document.querySelector('table[role="presentation"] a')
    expect(button?.textContent).toBe('Open Locatic')
    expect(button?.getAttribute('href')).toBe('https://locatic.test/home')
  })

  it('explains the subscription in the footer with unsubscribe and settings links', async () => {
    const document = await renderDocument(base)
    const footer = document.querySelector('footer')

    expect(footer?.textContent).toContain(
      "You're receiving Locatic updates because you have a Locatic account.",
    )
    expect(hrefs(document)).toContain(UNSUBSCRIBE_URL_PLACEHOLDER)
    expect(hrefs(document)).toContain(
      'https://locatic.test/settings?tab=notifications',
    )
    expect(footer?.textContent).not.toContain('PO Box')

    const withAddress = await renderDocument({
      ...base,
      postalAddress: 'PO Box 1, Springfield',
    })
    expect(withAddress.querySelector('footer')?.textContent).toContain(
      'PO Box 1, Springfield',
    )

    const digestFooter = (await renderDocument(digest)).querySelector('footer')
    expect(digestFooter?.textContent).toContain(
      'because you turned on the weekly digest',
    )
  })

  it('renders a plain-text version with links, the button and unsubscribe', async () => {
    const text = await renderCampaignText({
      ...base,
      content: {
        kind: 'announcement',
        body: base.content.body,
        cta: { label: 'Open Locatic', url: 'https://locatic.test/home' },
      },
    })

    expect(text).toContain('builders < ship')
    expect(text).toContain('Hello builders.')
    expect(text).toContain('the notes (https://x.dev/notes)')
    expect(text).toContain('- maps')
    expect(text).toContain('Open Locatic: https://locatic.test/home')
    expect(text).toContain(`Unsubscribe: ${UNSUBSCRIBE_URL_PLACEHOLDER}`)
    expect(text).toContain(
      'Email settings: https://locatic.test/settings?tab=notifications',
    )
    expect(text).not.toContain('**')
  })

  it('still renders digest projects and discussions', async () => {
    const document = await renderDocument(digest)
    const headings = [...document.querySelectorAll('h2')]

    expect(headings.map((heading) => heading.textContent)).toEqual([
      'projects worth a look',
      'discussions',
    ])
    for (const heading of headings) {
      expect(style(heading)).toContain('text-transform:uppercase')
      expect(style(heading)).toContain(`color:${emailPalette.muted}`)
    }
    expect(hrefs(document)).toContain('https://locatic.dev/p/grace/compiler')

    const text = await renderCampaignText(digest)
    expect(text).toContain('PROJECTS WORTH A LOOK')
    expect(text).toContain('grace/compiler')
    expect(text).toContain('Monorepo or not?')
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
    expect(style(document.querySelector('h1'))).toContain(
      'font-family:Arial, Helvetica, sans-serif',
    )
  })
})
