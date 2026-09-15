import type { NavAccent } from './roles'

// Tailwind's JIT scanner only picks up class names that appear literally in
// source -- a template string like `bg-accent-${accent}` would be silently
// dropped from the build. This lookup keeps every class name spelled out in
// full so the accent tokens defined in tailwind.config.js actually ship.
export const NAV_ACCENT_CLASSES: Record<
  NavAccent,
  { icon: string; chipBg: string; activeBg: string; activeText: string }
> = {
  indigo: {
    icon: 'text-accent-indigo',
    chipBg: 'bg-accent-indigo-soft',
    activeBg: 'bg-accent-indigo-soft',
    activeText: 'text-accent-indigo',
  },
  emerald: {
    icon: 'text-accent-emerald',
    chipBg: 'bg-accent-emerald-soft',
    activeBg: 'bg-accent-emerald-soft',
    activeText: 'text-accent-emerald',
  },
  amber: {
    icon: 'text-accent-amber',
    chipBg: 'bg-accent-amber-soft',
    activeBg: 'bg-accent-amber-soft',
    activeText: 'text-accent-amber',
  },
  teal: {
    icon: 'text-accent-teal',
    chipBg: 'bg-accent-teal-soft',
    activeBg: 'bg-accent-teal-soft',
    activeText: 'text-accent-teal',
  },
  rose: {
    icon: 'text-accent-rose',
    chipBg: 'bg-accent-rose-soft',
    activeBg: 'bg-accent-rose-soft',
    activeText: 'text-accent-rose',
  },
  line: {
    icon: 'text-accent-line',
    chipBg: 'bg-accent-line-soft',
    activeBg: 'bg-accent-line-soft',
    activeText: 'text-accent-line',
  },
  slate: {
    icon: 'text-accent-slate',
    chipBg: 'bg-accent-slate-soft',
    activeBg: 'bg-accent-slate-soft',
    activeText: 'text-accent-slate',
  },
}
