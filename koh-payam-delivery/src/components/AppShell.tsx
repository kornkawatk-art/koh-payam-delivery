import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { NAV, canAccess } from '../lib/roles'

export default function AppShell() {
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? 'packer'
  return (
    <div className="flex min-h-screen">
      <aside className="w-48 border-r bg-gray-50 p-3">
        <nav className="flex flex-col gap-1">
          {NAV.filter((n) => canAccess(n.path, role)).map((n) => (
            <NavLink
              key={n.path}
              to={n.path}
              end
              className={({ isActive }) =>
                'rounded px-2 py-1 text-sm ' +
                (isActive ? 'bg-black text-white' : 'hover:bg-gray-200')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm text-gray-600">
            {profile?.name} · {role}
          </span>
          <button className="text-sm underline" onClick={signOut}>
            ออกจากระบบ
          </button>
        </header>
        <main className="p-4">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
