import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/legal-page'
import { TERMS_MARKDOWN } from '@/features/legal/terms-content'
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from '@/features/legal/legal-dates'
import { seo } from '@/lib/seo'

const description =
  'The terms governing your use of Locatic, including eligibility, user content, prohibited conduct, and account deletion.'

export const Route = createFileRoute('/terms')({
  head: () => seo({ title: 'Terms of Service', description, path: '/terms' }),
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
