import { useId } from 'react'

/**
 * The app mark: a map pin holding the island and the sea, on the brand's Andaman teal; the orange
 * dot is where the goods go. Same artwork as public/favicon.svg. The logo keeps its own colours in
 * both themes.
 */
export function AppLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  const clip = useId() // unique per instance: two logos on a page can't share a clip id
  return (
    <svg
      role="img"
      aria-label="ระบบจัดส่งเกาะ"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="256" cy="226" r="92" />
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="112" fill="#0e5e6f" />
      <path
        d="M256 92 C176 92 116 152 116 230 C116 318 210 388 256 432 C302 388 396 318 396 230 C396 152 336 92 256 92Z"
        fill="#eef4f4"
      />
      <g clipPath={`url(#${clip})`}>
        <rect x="150" y="120" width="220" height="220" fill="#5ec4d2" />
        <path d="M176 250 C200 200 236 184 262 184 C296 184 320 214 336 250Z" fill="#0e5e6f" />
        <rect x="150" y="250" width="220" height="100" fill="#0a4856" />
        <path
          d="M160 274 C180 264 200 264 220 274 S260 284 280 274 S320 264 352 274"
          fill="none"
          stroke="#eef4f4"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>
      <circle cx="318" cy="166" r="22" fill="#e8662a" />
    </svg>
  )
}
