import type { ReactNode } from 'react'
import { PublicFooter } from '@/components/app-shell/public-footer'
import { PublicHeader } from '@/components/app-shell/public-header'

/** Page frame for signed-out visitors: public header, `<main>`, footer. */
export function VisitorCityFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <PublicHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-x-clip px-(--lx-gutter) pt-6 pb-16"
      >
        {children}
      </main>
      <PublicFooter />
    </div>
  )
}
