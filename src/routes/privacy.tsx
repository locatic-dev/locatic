import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/legal-page'
import { PRIVACY_MARKDOWN } from '@/features/legal/privacy-content'
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from '@/features/legal/legal-dates'
import { seo } from '@/lib/seo'

const description =
  'How Locatic collects, uses, and protects your data, plus the visibility controls and rights available to you.'

export const Route = createFileRoute('/privacy')({
  head: () => seo({ title: 'Privacy Policy', description, path: '/privacy' }),
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
