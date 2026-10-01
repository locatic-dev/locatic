import type { CSSProperties } from 'react'

import type { EmailCampaignContent } from '../email_campaigns'

export const RESEND_UNSUBSCRIBE_PLACEHOLDER = '{{{RESEND_UNSUBSCRIBE_URL}}}'

// Email clients cannot read the app's CSS variables, so the palette carries
// the sRGB hex of the default (teal) theme tokens in src/styles.css.
// src/lib/__tests__/theme-browser-colour.test.ts keeps the copies in step.
export const emailPalette = {
  background: '#090a0b', // --background (canvas)
  line: '#2a2b2d', // --border
  text: '#eaebed', // --foreground
  muted: '#a3a5a7', // --muted-foreground
  accent: '#00d1d2', // --primary
}
const palette = emailPalette

// The app's Geist and Geist Mono fall back to these same local fonts.
const fonts = {
  sans: 'Arial, Helvetica, sans-serif',
  mono: "Menlo, 'Courier New', monospace",
}

const pageStyle: CSSProperties = {
  backgroundColor: palette.background,
  color: palette.text,
  fontFamily: fonts.sans,
  margin: 0,
}

// Gmail drops <body> styles, so the wrapper repeats the background.
const wrapperStyle: CSSProperties = {
  ...pageStyle,
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
  fontFamily: fonts.mono,
  fontSize: '12px',
  lineHeight: 1.5,
  margin: '6px 0 0',
}

// The app's text-eyebrow role: mono, uppercase, tracked, muted.
const eyebrowStyle: CSSProperties = {
  ...metaStyle,
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.06em',
  lineHeight: 1.4,
  margin: '0 0 18px',
  textTransform: 'uppercase',
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
        {/* The design is dark already. A hint for clients that honour it
            (Apple Mail); Gmail and Outlook may still recolour it. */}
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <title>{content.subject}</title>
      </head>
      <body style={pageStyle}>
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
        <div style={wrapperStyle}>
          <main style={containerStyle}>
            <header>
              <p style={{ ...eyebrowStyle, margin: 0 }}>locatic / update</p>
              <h1
                style={{
                  color: palette.text,
                  fontFamily: fonts.sans,
                  fontSize: '28px',
                  fontWeight: 600,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.2,
                  margin: '12px 0 20px',
                }}
              >
                {content.subject}
              </h1>
            </header>

            <p style={copyStyle}>{content.introduction}</p>

            {content.projects.length > 0 ? (
              <section style={sectionStyle}>
                <h2 style={eyebrowStyle}>projects worth a look</h2>
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
                <h2 style={eyebrowStyle}>discussions</h2>
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
                <h2 style={eyebrowStyle}>what changed in locatic</h2>
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
        </div>
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
