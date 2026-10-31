import { useMutation } from 'convex/react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { useSignOut } from '@/integrations/clerk/sign-out'
import { toSafeRelativeUrl } from '@/lib/safe-redirect'
import { viewerQueryOptions } from './queries'
import { AccountRecoveryView } from './account-recovery-view'
import type { AccountRecoveryState } from './lifecycle'

export function AccountRecovery({
  state,
  destination,
}: {
  state: AccountRecoveryState
  destination: string | null
}) {
  const restoreAccount = useMutation(api.users.restoreAccount)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const signOut = useSignOut()
  return (
    <AccountRecoveryView
      state={state}
      onSignOut={signOut}
      onRestore={async () => {
        await restoreAccount({})
        await queryClient.invalidateQueries({
          queryKey: viewerQueryOptions().queryKey,
        })
        await navigate({
          href: toSafeRelativeUrl(destination ?? '/home') ?? '/home',
          replace: true,
        })
      }}
    />
  )
}
