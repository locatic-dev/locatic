import { createFileRoute } from '@tanstack/react-router'
import { PublicFooter } from '@/components/app-shell/public-footer'
import { PublicHeader } from '@/components/app-shell/public-header'
import { LOCATIC_DEFINITION } from '@/features/about/about-content'
import { AboutFaq } from '@/features/about/about-faq'
import { AboutLetter } from '@/features/about/about-letter'
import { seo, truncateDescription } from '@/lib/seo'
import {
  aboutPageNode,
  faqPageNode,
  organizationNode,
} from '@/lib/structured-data'
import { JsonLd } from '@/components/ui/json-ld'

/** What Locatic is, who builds it, and answers to common questions. */
export const Route = createFileRoute('/about')({
  head: () =>
    seo({
      title: 'About',
      description: truncateDescription(LOCATIC_DEFINITION),
      path: '/about',
    }),
  component: AboutPage,
})

function AboutPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-text">
      <PublicHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto grid w-full max-w-(--lx-form-max) flex-1 content-start gap-10 px-(--lx-gutter) py-10 md:py-14"
      >
        <header className="grid gap-4 border-b border-line pb-8">
          <h1 className="text-display text-text">about locatic</h1>
          <p className="text-body text-text">{LOCATIC_DEFINITION}</p>
        </header>

        <AboutLetter headingLevel="h2" />
        <AboutFaq />
      </main>

      <PublicFooter />
      <JsonLd nodes={[organizationNode(), aboutPageNode(), faqPageNode()]} />
    </div>
  )
}
