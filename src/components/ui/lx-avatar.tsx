import { useState } from 'react'

import { cn } from '@/lib/utils'

const AVATAR_PALETTE = [
  '#3a4a5c',
  '#4a3a5c',
  '#5c4a3a',
  '#3a5c4a',
  '#5c3a4a',
  '#3a5c5c',
  '#5c5c3a',
  '#4a5c3a',
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

interface LxAvatarProps {
  name: string
  avatarUrl?: string | null
  size?: number
  className?: string
  /**
   * The name is already shown next to the avatar (a person row, a byline):
   * hide the avatar from assistive technology so the name is read once.
   */
  decorative?: boolean
}

export function LxAvatar({
  name,
  avatarUrl,
  size = 32,
  className,
  decorative = false,
}: LxAvatarProps) {
  const initials = name
    .split(/[\s_.\-@/]+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const bg = AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length]

  // A broken or expired image URL falls back to initials. Keyed on the URL so
  // a new URL gets a fresh attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (avatarUrl && failedUrl !== avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={decorative ? '' : name}
        width={size}
        height={size}
        onError={() => setFailedUrl(avatarUrl)}
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={{
          width: size,
          height: size,
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-mono font-semibold tracking-[-0.02em] text-text',
        className,
      )}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': name })}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.max(9, size * 0.36),
      }}
    >
      {initials}
    </div>
  )
}
