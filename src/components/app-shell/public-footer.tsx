import { Link } from '@tanstack/react-router'
import * as m from 'motion/react-m'
import { fadeUp, viewportOnce } from '@/lib/motion'

const footerLinkClassName =
  'inline-flex min-h-11 items-center text-text-faint no-underline transition-colors hover:text-text'

// Footer shared by the public landing page and the legal pages. Surfaces the
// legal links so they are reachable from every public surface.
export function PublicFooter() {
  return (
    <m.footer
      className="border-t border-line px-(--lx-gutter) py-7 text-center font-mono text-[11.5px] text-text-faint"
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
        <a
          href="mailto:contact@locatic.dev"
          className={footerLinkClassName}
          aria-label="Email Locatic at contact@locatic.dev"
        >
          contact
        </a>
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
      <div className="mt-2">locatic · {new Date().getFullYear()}</div>
    </m.footer>
  )
}
