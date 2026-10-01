import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { LogOut, Settings } from '@/lib/icons'

export function ProfileMobileAccountActions({
  onSignOut,
}: {
  onSignOut: () => void
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 md:hidden">
      <Button asChild size="touch">
        <Link to="/settings" search={{ tab: 'account' }} preload={false}>
          <Settings size={13} />
          settings
        </Link>
      </Button>
      <Button variant="ghost" size="touch" onClick={onSignOut}>
        <LogOut size={13} />
        sign out
      </Button>
    </div>
  )
}
