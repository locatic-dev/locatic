export interface BrandIconProps {
  name: 'github' | 'twitter' | 'linkedin' | 'bluesky'
  size?: number
  className?: string
  style?: React.CSSProperties
}

export function BrandIcon({
  name,
  size = 16,
  className,
  style,
}: BrandIconProps) {
  const paths: Record<typeof name, React.ReactNode> = {
    github: (
      <path
        fill="currentColor"
        d="M8 .5a7.5 7.5 0 00-2.37 14.62c.37.07.5-.16.5-.36v-1.27c-2.08.45-2.52-1-2.52-1-.34-.87-.84-1.1-.84-1.1-.69-.47.05-.46.05-.46.76.05 1.16.78 1.16.78.67 1.15 1.77.82 2.2.62.07-.49.26-.82.48-1-1.66-.19-3.4-.83-3.4-3.7 0-.82.29-1.49.77-2.01-.08-.19-.34-.95.07-1.99 0 0 .63-.2 2.07.77a7.2 7.2 0 013.77 0c1.43-.97 2.06-.77 2.06-.77.41 1.04.15 1.8.07 1.99.48.52.77 1.19.77 2.01 0 2.88-1.75 3.51-3.41 3.7.27.23.51.69.51 1.39v2.06c0 .2.13.43.5.36A7.5 7.5 0 008 .5z"
      />
    ),
    twitter: (
      <path
        fill="currentColor"
        d="M12.6 2H14L9.7 6.9 14.7 14H10.7L7.6 9.9 4 14H2.6L7.2 8.7 2.4 2H6.5L9.3 5.7 12.6 2zm-.5 11h.9L5.7 3h-1l7.4 10z"
      />
    ),
    linkedin: (
      <path
        fill="currentColor"
        d="M12.5 2h-9A1.5 1.5 0 002 3.5v9A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0012.5 2zM6 12H4V7h2v5zm-1-5.8a1.2 1.2 0 110-2.4 1.2 1.2 0 010 2.4zM12 12h-2V9.5c0-.8-.3-1.3-1-1.3-.5 0-.8.3-1 .7v3.1H6V7h2v.7c.3-.5 1-.7 1.7-.7C11 7 12 7.8 12 9.5V12z"
      />
    ),
    bluesky: (
      <path
        fill="currentColor"
        d="M4.6 2.6C6 3.7 7.5 6 8 7.2c.5-1.2 2-3.5 3.4-4.6C12.5 1.6 14 1.2 14 2.8c0 .3-.2 2.7-.3 3.1-.4 1.5-1.7 1.8-3 1.6 2.1.4 2.6 1.6 1.5 2.8-2.1 2.2-3.1-.6-3.3-1.3-.1-.4-.3-.4-.4 0-.2.7-1.2 3.5-3.3 1.3-1.1-1.2-.6-2.4 1.5-2.8-1.3.2-2.6-.1-3-1.6C3.5 5.5 3.3 3.1 3.3 2.8c0-1.6 1.5-1.2 1.3-.2z"
      />
    ),
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      style={style}
      aria-hidden
    >
      {paths[name]}
    </svg>
  )
}
