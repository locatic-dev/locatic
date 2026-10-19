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
  signOutHoldMs,
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
  const visibleAt = useRef<number | null>(null)
  const requestSignOut = useCallback(() => {
    if (phase.current !== 'idle') return
    phase.current = 'requested'
    visibleAt.current = null
    setIsSigningOut(true)
  }, [])

  const markVisible = useCallback(() => {
    visibleAt.current ??= performance.now()
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
      let signedOut = false
      try {
        await queryClient.cancelQueries()
        clearSessionCache(queryClient)
        // The Clerk TanStack adapter awaits navigation before resolving.
        await signOut({ redirectUrl: '/' })
        setCacheUserId(null)
        signedOut = true
      } catch (error) {
        const { reportActionError } = await import('@/lib/action-error')
        reportActionError(error, {
          title: "couldn't sign out",
          retry: requestSignOut,
        })
      } finally {
        // Visible progress keeps its minimum on success and failure alike.
        const holdMs = signOutHoldMs(visibleAt.current, performance.now())
        if (holdMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, holdMs))
        }
        phase.current = 'idle'
        setIsSigningOut(false)
      }
      // Confirm only after the landing page is revealed. Sonner stays out of
      // the initial entry, and its Toaster outlives this provider's children.
      // A missed confirmation is harmless: the session has already ended, so
      // a failed chunk load must not report a sign-out failure or retry.
      if (signedOut) {
        import('sonner')
          .then(({ toast }) => toast('signed out'))
          .catch(() => {})
      }
    }
    void finishSignOut()
  }, [isSigningOut, queryClient, requestSignOut, signOut])

  let content = children
  if (isSigningOut) content = <SignOutPending onVisible={markVisible} />
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
