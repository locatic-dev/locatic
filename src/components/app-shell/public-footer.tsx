import { Link } from '@tanstack/react-router'

const footerLinkClassName =
  'inline-flex min-h-11 items-center text-text-faint no-underline transition-colors hover:text-text'

// Footer shared by the public landing page and the legal pages. Surfaces the
// legal links so they are reachable from every public surface.
export function PublicFooter() {
  return (
    <footer className="border-t border-line px-(--lx-gutter) py-7 text-center font-mono text-[11.5px] text-text-faint">
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
        <Link to="/privacy" className={footerLinkClassName}>
          privacy
        </Link>
        <Link to="/terms" className={footerLinkClassName}>
          terms
        </Link>
        <a
          href="https://github.com"
          className={footerLinkClassName}
          target="_blank"
          rel="noopener noreferrer"
        >
          github
        </a>
      </nav>
      <div className="mt-3">built with ❤️ for developers</div>
      <div className="mt-2 opacity-70">
        locatic · {new Date().getFullYear()}
      </div>
    </footer>
  )
}
