import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { NAV, canAccess } from '../lib/roles'

export default function AppShell() {
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? 'packer'
  const items = NAV.filter((n) => canAccess(n.path, role))
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  // Close the mobile drawer on navigation and on Escape.
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="min-h-screen bg-paper lg:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <button
          className="btn btn-ghost btn-sm -ml-2"
          aria-label="เมนู"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-semibold">เกาะพยาม</span>
        </button>
        <span className="truncate text-sm text-ink-soft">
          {profile?.name} · {role}
        </span>
      </header>

      {/* Drawer scrim (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-ink/30 lg:hidden"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — off-canvas drawer on mobile, fixed rail on desktop */}
      <aside
        className={
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform duration-200 lg:static lg:z-auto lg:w-60 lg:translate-x-0 ' +
          (open ? 'translate-x-0 shadow-pop' : '-translate-x-full')
        }
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-white">
            KP
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">เกาะพยาม</p>
            <p className="text-xs text-ink-faint">ระบบจัดส่ง</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-1">
            {items.map((n) => (
              <li key={n.path}>
                <NavLink
                  to={n.path}
                  end
                  className={({ isActive }) =>
                    'block rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
                    (isActive
                      ? 'bg-brand-soft text-brand-ink'
                      : 'text-ink-soft hover:bg-paper hover:text-ink')
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-line p-3">
          <p className="truncate px-1 pb-2 text-xs text-ink-faint">
            {profile?.name} · {role}
          </p>
          <button className="btn btn-secondary btn-sm w-full" onClick={signOut}>
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <main className="container-page py-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
