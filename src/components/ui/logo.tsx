interface LogoProps {
  size?: number
  className?: string
}

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-[4px] bg-brand ${className ?? ''}`}
      style={{
        width: size,
        height: size,
      }}
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <path
          d="M8 14s-4.5-4-4.5-7.5a4.5 4.5 0 019 0C12.5 10 8 14 8 14z"
          stroke="#0d1117"
          strokeWidth="2"
          fill="none"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="6.5" r="1.6" fill="#0d1117" />
      </svg>
    </div>
  )
}
