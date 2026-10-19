import type { CSSProperties, ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'

import type { EmailCampaignContent } from '../email_campaigns'
import { settingsUrl, UNSUBSCRIBE_URL_PLACEHOLDER } from './placeholders'

export { UNSUBSCRIBE_URL_PLACEHOLDER }

export interface CommunityUpdateProps {
  subject: string
  preheader: string
  content: EmailCampaignContent
  siteUrl: string
  postalAddress: string | null
}

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
}

const listStyle: CSSProperties = {
  ...copyStyle,
  paddingLeft: '24px',
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

/** Paragraphs, emphasis, HTTPS links and lists; nothing else survives. */
export const ALLOWED_MARKDOWN_ELEMENTS = [
  'p',
  'strong',
  'em',
  'a',
  'ul',
  'ol',
  'li',
]

// Markdown percent-encodes the placeholder's braces in link targets.
const ENCODED_UNSUBSCRIBE_URL_PLACEHOLDER = encodeURI(
  UNSUBSCRIBE_URL_PLACEHOLDER,
)

/** Body links: HTTPS only, plus the reader's own unsubscribe link. */
export function toEmailHref(url: string) {
  if (
    url === UNSUBSCRIBE_URL_PLACEHOLDER ||
    url === ENCODED_UNSUBSCRIBE_URL_PLACEHOLDER
  ) {
    return UNSUBSCRIBE_URL_PLACEHOLDER
  }
  return url.startsWith('https://') ? url : ''
}

const markdownComponents: Components = {
  p: ({ children }) => <p style={copyStyle}>{children}</p>,
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  a: ({ href, children }) =>
    href ? (
      <a href={href} style={linkStyle}>
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  ul: ({ children }) => <ul style={listStyle}>{children}</ul>,
  ol: ({ children }) => <ol style={listStyle}>{children}</ol>,
  li: ({ children }) => <li style={{ margin: '0 0 6px' }}>{children}</li>,
}

/** The admin-written body: a Markdown subset with no raw HTML or images. */
export function EmailBody({ markdown }: { markdown: string }) {
  return (
    <Markdown
      allowedElements={ALLOWED_MARKDOWN_ELEMENTS}
      unwrapDisallowed
      skipHtml
      urlTransform={toEmailHref}
      components={markdownComponents}
    >
      {markdown}
    </Markdown>
  )
}

export { settingsUrl }

export function footerReason(kind: EmailCampaignContent['kind']) {
  return kind === 'digest'
    ? "You're receiving the Locatic weekly digest because you turned on the weekly digest."
    : "You're receiving Locatic updates because you have a Locatic account."
}

// A table keeps the button's padding and colour in Outlook.
function CallToAction({ label, url }: { label: string; url: string }) {
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      style={{ margin: '8px 0 24px' }}
    >
      <tbody>
        <tr>
          <td style={{ backgroundColor: palette.accent, borderRadius: '8px' }}>
            <a
              href={url}
              style={{
                color: palette.background,
                display: 'inline-block',
                fontFamily: fonts.sans,
                fontSize: '15px',
                fontWeight: 600,
                padding: '12px 20px',
                textDecoration: 'none',
              }}
            >
              {label}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={eyebrowStyle}>{title}</h2>
      {children}
    </section>
  )
}

export function CommunityUpdateEmail({
  subject,
  preheader,
  content,
  siteUrl,
  postalAddress,
}: CommunityUpdateProps) {
  const projects = content.kind === 'digest' ? content.projects : []
  const discussions = content.kind === 'digest' ? content.discussions : []
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        {/* The design is dark already. A hint for clients that honour it
            (Apple Mail); Gmail and Outlook may still recolour it. */}
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <title>{subject}</title>
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
          {preheader}
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
                {subject}
              </h1>
            </header>

            <EmailBody markdown={content.body} />

            {content.cta ? (
              <CallToAction label={content.cta.label} url={content.cta.url} />
            ) : null}

            {projects.length > 0 ? (
              <Section title="projects worth a look">
                {projects.map((project) => (
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
              </Section>
            ) : null}

            {discussions.length > 0 ? (
              <Section title="discussions">
                {discussions.map((discussion) => (
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
              </Section>
            ) : null}

            <footer style={{ ...sectionStyle, color: palette.muted }}>
              <p style={metaStyle}>{footerReason(content.kind)}</p>
              <p style={metaStyle}>
                <a href={UNSUBSCRIBE_URL_PLACEHOLDER} style={linkStyle}>
                  Unsubscribe
                </a>
                {' · '}
                <a href={settingsUrl(siteUrl)} style={linkStyle}>
                  Email settings
                </a>
              </p>
              {postalAddress ? <p style={metaStyle}>{postalAddress}</p> : null}
            </footer>
          </main>
        </div>
      </body>
    </html>
  )
}
