import { useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { shouldPrefetchClerkUi } from '@/integrations/clerk/ui-loading'
import { ClerkProvider } from '@clerk/tanstack-react-start'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!PUBLISHABLE_KEY) {
  throw new Error('Add your Clerk Publishable Key to the .env.local file')
}

export default function AppClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [prefetchUI] = useState(() => shouldPrefetchClerkUi(pathname))
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      prefetchUI={prefetchUI}
    >
      {children}
    </ClerkProvider>
  )
}
