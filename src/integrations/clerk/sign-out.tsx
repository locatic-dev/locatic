import { useAuth, useClerk } from '@clerk/tanstack-react-start'
import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ContentRoutePending,
  SignOutPending,
} from '@/components/app-shell/route-pending'
import { clearSessionCache } from '@/integrations/convex/session-cache'

const SignOutContext = createContext<(() => void) | null>(null)

/** Owns sign-out above routed query consumers, including route error UIs. */
export function SignOutProvider({ children }: { children: ReactNode }) {
  const { signOut } = useClerk()
  const { isLoaded, userId } = useAuth()
  const [cacheUserId, setCacheUserId] = useState(userId)
  const isChangingUser =
    isLoaded && cacheUserId !== undefined && cacheUserId !== userId
  const queryClient = useQueryClient()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const phase = useRef<'idle' | 'requested' | 'running'>('idle')
  const requestSignOut = useCallback(() => {
    if (phase.current !== 'idle') return
    phase.current = 'requested'
    setIsSigningOut(true)
  }, [])

  useEffect(() => {
    if (!isLoaded || isSigningOut || cacheUserId === userId) return
    // Initial Clerk hydration keeps the SSR cache. Subsequent identity changes
    // must retire the old cache even when no local sign-out control was used.
    if (cacheUserId === undefined) {
      setCacheUserId(userId)
      return
    }
    let current = true
    void queryClient.cancelQueries().then(() => {
      if (!current) return
      clearSessionCache(queryClient)
      setCacheUserId(userId)
    })
    return () => {
      current = false
    }
  }, [cacheUserId, isLoaded, isSigningOut, queryClient, userId])

  useEffect(() => {
    if (!isSigningOut || phase.current !== 'requested') return
    phase.current = 'running'

    // This effect runs after the progress UI commits and consumers unmount.
    // The Convex Query adapter retains watches until cache entries are removed;
    // cancelling requests or unmounting their observers alone is insufficient.
    async function finishSignOut() {
      try {
        await queryClient.cancelQueries()
        clearSessionCache(queryClient)
        // The Clerk TanStack adapter awaits navigation before resolving.
        await signOut({ redirectUrl: '/' })
        setCacheUserId(null)
      } catch (error) {
        const { reportActionError } = await import('@/lib/action-error')
        reportActionError(error, {
          title: "couldn't sign out",
          retry: requestSignOut,
        })
      } finally {
        phase.current = 'idle'
        setIsSigningOut(false)
      }
    }
    void finishSignOut()
  }, [isSigningOut, queryClient, requestSignOut, signOut])

  let content = children
  if (isSigningOut) content = <SignOutPending />
  else if (isChangingUser) content = <ContentRoutePending />

  return (
    <SignOutContext.Provider value={requestSignOut}>
      {content}
    </SignOutContext.Provider>
  )
}

export function useSignOut() {
  const signOut = useContext(SignOutContext)
  if (!signOut) throw new Error('useSignOut requires SignOutProvider')
  return signOut
}
