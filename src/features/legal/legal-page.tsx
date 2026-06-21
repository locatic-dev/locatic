import { Link } from '@tanstack/react-router'
import { PublicHeader } from '@/components/app-shell/public-header'
import { PublicFooter } from '@/components/app-shell/public-footer'
import { MarkdownProse } from '@/components/ui/markdown-prose'

const docNavLinkClassName =
  'inline-flex min-h-11 items-center text-text-muted no-underline transition-colors hover:text-text'

type LegalPageProps = {
  title: string
  effective: string
  lastUpdated: string
  markdown: string
}

export function LegalPage({
  title,
  effective,
  lastUpdated,
  markdown,
}: LegalPageProps) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas text-text">
      <PublicHeader />

      <main className="mx-auto w-full max-w-(--lx-form-max) flex-1 px-(--lx-gutter) py-10 md:py-14">
        <header className="mb-8 border-b border-line pb-6">
          <h1 className="m-0 font-mono text-[28px] font-bold tracking-[-0.025em] text-text md:text-[34px]">
            {title}
          </h1>
          <p className="mt-3 mb-0 font-mono text-[11.5px] text-text-faint">
            Effective {effective} · Last updated {lastUpdated}
          </p>
          <nav className="mt-5 flex flex-wrap gap-x-5 font-mono text-[12.5px]">
            <Link
              to="/privacy"
              className={docNavLinkClassName}
              activeProps={{ className: 'font-semibold text-text' }}
            >
              privacy policy
            </Link>
            <Link
              to="/terms"
              className={docNavLinkClassName}
              activeProps={{ className: 'font-semibold text-text' }}
            >
              terms of service
            </Link>
          </nav>
        </header>

        <MarkdownProse>{markdown}</MarkdownProse>
      </main>

      <PublicFooter />
    </div>
  )
}
