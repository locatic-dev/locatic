import type { CSSProperties } from 'react'
import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from 'lucide-react'
import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

// Sonner's own stylesheet is injected unlayered, so Tailwind utility classes
// on toasts lose the cascade. Its palette is driven by these custom
// properties instead, set inline on the toaster so they win over the theme
// defaults.
const toasterStyle = {
  '--normal-bg': 'var(--lx-surface-raised)',
  '--normal-border': 'var(--lx-border-strong)',
  '--normal-text': 'var(--lx-text)',
} as CSSProperties

// Below 768px the app shell shows the fixed mobile tab bar, so toasts sit
// above it: `--lx-toast-offset-bottom` (styles.css) covers 601–767px, and
// Sonner's own mobile layout (≤600px) uses `mobileOffset`.
const TOAST_OFFSET = { bottom: 'var(--lx-toast-offset-bottom)' }
const TOAST_MOBILE_OFFSET = {
  bottom: 'calc(var(--lx-mobile-tab-height) + 8px)',
}

// Locatic's themes ('teal' | 'violet' | 'amber') are all dark palettes; they are
// not Sonner theme values, so the toaster is always dark. The theme is set
// here only; callers do not pass it.
const Toaster = ({ style, ...props }: Omit<ToasterProps, 'theme'>) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-center"
      offset={TOAST_OFFSET}
      mobileOffset={TOAST_MOBILE_OFFSET}
      className="toaster group"
      style={{ ...toasterStyle, ...style }}
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      {...props}
    />
  )
}

export { Toaster }
