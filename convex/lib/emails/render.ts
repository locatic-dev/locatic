'use node'

import { render, toPlainText } from '@react-email/render'
import { createElement } from 'react'

import {
  type CommunityUpdateProps,
  CommunityUpdateEmail,
  EmailBody,
  footerReason,
  settingsUrl,
  UNSUBSCRIBE_URL_PLACEHOLDER,
} from './community_update'

// @react-email/render needs Node APIs: import this module only from
// 'use node' actions (and tests).

export async function renderCampaignHtml(props: CommunityUpdateProps) {
  return await render(createElement(CommunityUpdateEmail, props))
}

async function renderBodyText(markdown: string) {
  const html = await render(createElement(EmailBody, { markdown }))
  return toPlainText(html, {
    selectors: [
      { selector: 'a', options: { linkBrackets: ['(', ')'] } },
      { selector: 'ul', options: { itemPrefix: '- ' } },
    ],
  }).trim()
}

/** The plain-text part, mirroring the HTML sections. */
export async function renderCampaignText(props: CommunityUpdateProps) {
  const { content } = props
  const sections = [props.subject, await renderBodyText(content.body)]

  if (content.cta) {
    sections.push(`${content.cta.label}: ${content.cta.url}`)
  }

  if (content.kind === 'digest' && content.projects.length > 0) {
    sections.push(
      [
        'PROJECTS WORTH A LOOK',
        ...content.projects.flatMap((project) => [
          project.fullName,
          ...(project.description ? [project.description] : []),
          project.activityLabel,
          project.url,
        ]),
      ].join('\n'),
    )
  }

  if (content.kind === 'digest' && content.discussions.length > 0) {
    sections.push(
      [
        'DISCUSSIONS',
        ...content.discussions.flatMap((discussion) => [
          discussion.title,
          discussion.summary,
          discussion.url,
        ]),
      ].join('\n'),
    )
  }

  sections.push(
    [
      footerReason(content.kind),
      `Unsubscribe: ${UNSUBSCRIBE_URL_PLACEHOLDER}`,
      `Email settings: ${settingsUrl(props.siteUrl)}`,
      ...(props.postalAddress ? [props.postalAddress] : []),
    ].join('\n'),
  )

  return sections.filter(Boolean).join('\n\n')
}
