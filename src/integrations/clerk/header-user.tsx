import { SignInButton, UserButton, useUser } from '@clerk/react'

export default function HeaderUser() {
  const { isSignedIn } = useUser()

  return <>{isSignedIn ? <UserButton /> : <SignInButton />}</>
}
