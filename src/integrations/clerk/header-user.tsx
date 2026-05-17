import { SignInButton, UserButton, useUser } from '@clerk/tanstack-react-start'

export default function HeaderUser() {
  const { isSignedIn } = useUser()

  return <>{isSignedIn ? <UserButton /> : <SignInButton />}</>
}
