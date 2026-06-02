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
      <Button
        asChild
        variant="monoOutline"
        size="meta"
        className="w-full font-mono"
      >
        <Link to="/settings" search={{ tab: 'account' }} preload={false}>
          <Settings size={13} />
          settings
        </Link>
      </Button>
      <Button
        variant="monoGhost"
        size="meta"
        onClick={onSignOut}
        className="w-full font-mono text-danger hover:text-danger"
      >
        <LogOut size={13} />
        sign out
      </Button>
    </div>
  )
}
