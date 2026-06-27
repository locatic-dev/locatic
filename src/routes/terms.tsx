import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/legal-page'
import { TERMS_MARKDOWN } from '@/features/legal/terms-content'
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from '@/features/legal/legal-dates'

const description =
  'The terms governing your use of Locatic, including eligibility, user content, prohibited conduct, and account deletion.'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      { title: 'Terms of Service · Locatic' },
      { name: 'description', content: description },
      { property: 'og:title', content: 'Terms of Service · Locatic' },
      { property: 'og:description', content: description },
    ],
    links: [{ rel: 'canonical', href: 'https://locatic.dev/terms' }],
  }),
  component: TermsPage,
})

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      effective={LEGAL_EFFECTIVE_DATE}
      lastUpdated={LEGAL_LAST_UPDATED}
      markdown={TERMS_MARKDOWN}
    />
  )
}
