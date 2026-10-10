import { Suspense } from 'react'
import { lazyPage } from './lib/lazyPage'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { canAccess } from './lib/roles'
import AppShell from './components/AppShell'
import Login from './routes/team/Login'
import TwoFactorSetup from './routes/team/TwoFactorSetup'
import TwoFactorChallenge from './routes/team/TwoFactorChallenge'

// Every page except login/2FA loads on demand: one 1.6 MB bundle made a
// customer opening a LINE link download the Excel reader, the QR scanner and
// every team page first. Each page is now its own chunk.
const DailyDashboard = lazyPage(() => import('./routes/team/DailyDashboard'))
const ImportOrders = lazyPage(() => import('./routes/team/ImportOrders'))
const BoatSetup = lazyPage(() => import('./routes/team/BoatSetup'))
const PierLoad = lazyPage(() => import('./routes/team/PierLoad'))
const FoamBoxes = lazyPage(() => import('./routes/team/FoamBoxes'))
const ClaimsQueue = lazyPage(() => import('./routes/team/ClaimsQueue'))
const ClaimDetail = lazyPage(() => import('./routes/team/ClaimDetail'))
const LineContacts = lazyPage(() => import('./routes/team/LineContacts'))
const AuditLog = lazyPage(() => import('./routes/team/AuditLog'))
const ShortageReport = lazyPage(() => import('./routes/team/ShortageReport'))
const CustomerAliases = lazyPage(() => import('./routes/team/CustomerAliases'))
const OrderDetail = lazyPage(() => import('./routes/team/OrderDetail'))
const PackOrder = lazyPage(() => import('./routes/team/PackOrder'))
const PackGroup = lazyPage(() => import('./routes/team/PackGroup'))
const CustomerOrderView = lazyPage(() => import('./routes/customer/CustomerOrderView'))
const LineRegister = lazyPage(() => import('./routes/customer/LineRegister'))

const LOADING = (
  <div className="flex min-h-screen items-center justify-center text-sm text-ink-soft">
    กำลังโหลด…
  </div>
)

function RequireAuth({ children }: { children: JSX.Element }) {
  const { loading, session, mfaLoaded, needsMfaSetup, needsMfaChallenge } = useAuth()
  if (loading) return LOADING
  if (!session) return <Navigate to="/login" replace />
  if (!mfaLoaded) return LOADING // MFA state not yet decided — don't redirect or render content
  if (needsMfaSetup) return <Navigate to="/2fa/setup" replace />
  if (needsMfaChallenge) return <Navigate to="/2fa" replace />
  return children
}

function RequireRole({ path, children }: { path: string; children: JSX.Element }) {
  const { session, profile, profileLoaded } = useAuth()
  // Authed but profile fetch not settled yet — never render restricted content in the gap.
  if (session && !profileLoaded) return LOADING
  // Fail closed: no profile (missing row or fetch error) => no access.
  if (!profile || !canAccess(path, profile.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={LOADING}>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Customer order link — no team session; the link_token is the only credential. */}
          <Route path="/o/:token" element={<CustomerOrderView />} />
          {/* LIFF registration page — opened inside LINE's in-app browser; no team session, no link_token. */}
          <Route path="/liff/register" element={<LineRegister />} />
          <Route path="/2fa/setup" element={<TwoFactorSetup />} />
          <Route path="/2fa" element={<TwoFactorChallenge />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<DailyDashboard />} />
            <Route
              path="/import"
              element={
                <RequireRole path="/import">
                  <ImportOrders />
                </RequireRole>
              }
            />
            <Route
              path="/boats"
              element={
                <RequireRole path="/boats">
                  <BoatSetup />
                </RequireRole>
              }
            />
            <Route
              path="/pier"
              element={
                <RequireRole path="/pier">
                  <PierLoad />
                </RequireRole>
              }
            />
            <Route
              path="/foam"
              element={
                <RequireRole path="/foam">
                  <FoamBoxes />
                </RequireRole>
              }
            />
            <Route
              path="/claims"
              element={
                <RequireRole path="/claims">
                  <ClaimsQueue />
                </RequireRole>
              }
            />
            <Route
              path="/claims/:id"
              element={
                <RequireRole path="/claims">
                  <ClaimDetail />
                </RequireRole>
              }
            />
            <Route
              path="/line-contacts"
              element={
                <RequireRole path="/line-contacts">
                  <LineContacts />
                </RequireRole>
              }
            />
            <Route
              path="/audit-log"
              element={
                <RequireRole path="/audit-log">
                  <AuditLog />
                </RequireRole>
              }
            />
            <Route
              path="/shortage-report"
              element={
                <RequireRole path="/shortage-report">
                  <ShortageReport />
                </RequireRole>
              }
            />
            <Route
              path="/customer-aliases"
              element={
                <RequireRole path="/customer-aliases">
                  <CustomerAliases />
                </RequireRole>
              }
            />
            <Route path="/order/:id" element={<OrderDetail />} />
            <Route path="/order/:id/pack" element={<PackOrder />} />
            <Route path="/customer/:date/:phone/pack" element={<PackGroup />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
