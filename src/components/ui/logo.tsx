interface LogoProps {
  size?: number
  className?: string
  alt?: string
  src?: string
}

export function Logo({
  size = 24,
  className,
  alt = '',
  src = '/favicon.svg',
}: LogoProps) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  )
}
