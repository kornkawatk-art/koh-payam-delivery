import { useId } from 'react'

/**
 * The app mark: a boat on a wave (deliveries by boat to the islands), in the
 * brand's stone-to-amber gradient. Same artwork as public/favicon.svg.
 */
export function AppLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  const grad = useId() // unique per instance: two logos on a page can't share a gradient id
  return (
    <svg
      role="img"
      aria-label="ระบบจัดส่งเกาะ"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c1917" />
          <stop offset="1" stopColor="#7c5214" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${grad})`} />
      <path d="M18 34h28l-5 9H23z" fill="#fff" />
      <rect x="30" y="18" width="3" height="16" fill="#fff" />
      <path d="M33 19l9 12h-9z" fill="#f2c46d" />
      <path
        d="M12 48c4 0 4-3 8-3s4 3 8 3 4-3 8-3 4 3 8 3 4-3 8-3"
        fill="none"
        stroke="#f2c46d"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
