import { Link } from '@tanstack/react-router'
import { Logo } from '@/components/ui/logo'

// Top bar shared by the public landing page and the legal pages.
export function PublicHeader() {
  return (
    <header className="relative z-2 flex min-h-16 flex-wrap items-center justify-between gap-4 border-b border-line px-(--lx-gutter) py-4">
      <Link to="/" className="flex items-center gap-2.5 text-text no-underline">
        <Logo size={32} />
        <span className="font-mono text-base font-bold tracking-[-0.02em]">
          locatic
        </span>
        <span className="ml-1 rounded-[3px] border border-line px-1.5 py-0.5 font-mono text-[10.5px] leading-none text-text-faint">
          v0.1 · beta
        </span>
      </Link>
      <nav className="flex flex-wrap items-center gap-3 font-mono text-[12.5px] text-text-muted">
        <a
          href="https://github.com"
          className="text-inherit no-underline transition-colors hover:text-text"
          target="_blank"
          rel="noopener noreferrer"
        >
          github
        </a>
        <Link
          to="/sign-in/$"
          className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface-alt px-3.5 py-2 font-mono text-[12.5px] text-text no-underline transition-colors hover:border-line-strong hover:bg-surface"
        >
          sign in
        </Link>
      </nav>
    </header>
  )
}
