import type { CSSProperties } from 'react'

import type { EmailCampaignContent } from '../email_campaigns'

export const RESEND_UNSUBSCRIBE_PLACEHOLDER = '{{{RESEND_UNSUBSCRIBE_URL}}}'

// Keep this palette inline and email-client-safe rather than importing app CSS.
const palette = {
  background: '#111719',
  surface: '#1b2427',
  line: '#344044',
  text: '#e8efef',
  muted: '#a7b5b7',
  accent: '#39c8c2',
}

const bodyStyle: CSSProperties = {
  backgroundColor: palette.background,
  color: palette.text,
  fontFamily: 'Arial, Helvetica, sans-serif',
  margin: 0,
  padding: '32px 16px',
}

const containerStyle: CSSProperties = {
  margin: '0 auto',
  maxWidth: '620px',
}

const sectionStyle: CSSProperties = {
  borderTop: `1px solid ${palette.line}`,
  marginTop: '28px',
  paddingTop: '22px',
}

const copyStyle: CSSProperties = {
  color: palette.text,
  fontSize: '16px',
  lineHeight: 1.65,
  margin: '0 0 16px',
  whiteSpace: 'pre-wrap',
}

const metaStyle: CSSProperties = {
  color: palette.muted,
  fontFamily: 'Courier New, monospace',
  fontSize: '12px',
  lineHeight: 1.5,
  margin: '6px 0 0',
}

const linkStyle: CSSProperties = {
  color: palette.accent,
  textDecoration: 'underline',
}

export function CommunityUpdateEmail({
  content,
}: {
  content: EmailCampaignContent
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <title>{content.subject}</title>
      </head>
      <body style={bodyStyle}>
        <div
          style={{
            display: 'none',
            maxHeight: 0,
            maxWidth: 0,
            opacity: 0,
            overflow: 'hidden',
          }}
        >
          {content.preheader}
        </div>
        <main style={containerStyle}>
          <header>
            <p style={{ ...metaStyle, color: palette.accent }}>
              locatic / update
            </p>
            <h1
              style={{
                color: palette.text,
                fontFamily: 'Courier New, monospace',
                fontSize: '28px',
                lineHeight: 1.25,
                margin: '12px 0 20px',
              }}
            >
              {content.subject}
            </h1>
          </header>

          <p style={copyStyle}>{content.introduction}</p>

          {content.projects.length > 0 ? (
            <section style={sectionStyle}>
              <h2
                style={{
                  fontFamily: 'Courier New, monospace',
                  fontSize: '18px',
                  margin: '0 0 18px',
                }}
              >
                projects worth a look
              </h2>
              {content.projects.map((project) => (
                <article
                  key={String(project.projectId)}
                  style={{ marginBottom: '22px' }}
                >
                  <a href={project.url} style={linkStyle}>
                    <strong>{project.fullName}</strong>
                  </a>
                  {project.description ? (
                    <p style={{ ...copyStyle, margin: '8px 0 0' }}>
                      {project.description}
                    </p>
                  ) : null}
                  <p style={metaStyle}>{project.activityLabel}</p>
                </article>
              ))}
            </section>
          ) : null}

          {content.discussions.length > 0 ? (
            <section style={sectionStyle}>
              <h2
                style={{
                  fontFamily: 'Courier New, monospace',
                  fontSize: '18px',
                  margin: '0 0 18px',
                }}
              >
                discussions
              </h2>
              {content.discussions.map((discussion) => (
                <article
                  key={String(discussion.commentId)}
                  style={{ marginBottom: '22px' }}
                >
                  <a href={discussion.url} style={linkStyle}>
                    <strong>{discussion.title}</strong>
                  </a>
                  <p style={{ ...copyStyle, margin: '8px 0 0' }}>
                    {discussion.summary}
                  </p>
                </article>
              ))}
            </section>
          ) : null}

          {content.shippingUpdate.trim() ? (
            <section style={sectionStyle}>
              <h2
                style={{
                  fontFamily: 'Courier New, monospace',
                  fontSize: '18px',
                  margin: '0 0 18px',
                }}
              >
                what changed in locatic
              </h2>
              <p style={copyStyle}>{content.shippingUpdate}</p>
            </section>
          ) : null}

          <footer style={{ ...sectionStyle, color: palette.muted }}>
            <p style={metaStyle}>
              You are receiving community and product updates from Locatic.
            </p>
            <p style={metaStyle}>
              <a href={RESEND_UNSUBSCRIBE_PLACEHOLDER} style={linkStyle}>
                unsubscribe
              </a>
            </p>
          </footer>
        </main>
      </body>
    </html>
  )
}

export function renderCommunityUpdateText(content: EmailCampaignContent) {
  const sections = [content.subject, content.introduction]

  if (content.projects.length > 0) {
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

  if (content.discussions.length > 0) {
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

  if (content.shippingUpdate.trim()) {
    sections.push(`WHAT CHANGED IN LOCATIC\n${content.shippingUpdate}`)
  }

  sections.push(
    `You are receiving community and product updates from Locatic.\nUnsubscribe: ${RESEND_UNSUBSCRIBE_PLACEHOLDER}`,
  )

  return sections.join('\n\n')
}
