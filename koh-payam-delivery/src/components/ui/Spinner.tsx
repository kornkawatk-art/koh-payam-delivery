export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-ink-soft" role="status">
      <svg
        className="h-4 w-4 animate-spin text-ink-faint"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label}
    </div>
  )
}
