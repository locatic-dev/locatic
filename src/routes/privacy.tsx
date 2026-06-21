import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/legal-page'
import { PRIVACY_MARKDOWN } from '@/features/legal/privacy-content'
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from '@/features/legal/legal-dates'

const description =
  'How Locatic collects, uses, and protects your data, plus the visibility controls and rights available to you.'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy Policy · Locatic' },
      { name: 'description', content: description },
      { property: 'og:title', content: 'Privacy Policy · Locatic' },
      { property: 'og:description', content: description },
    ],
    links: [{ rel: 'canonical', href: 'https://locatic.dev/privacy' }],
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effective={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      markdown={PRIVACY_MARKDOWN}
    />
  )
}
