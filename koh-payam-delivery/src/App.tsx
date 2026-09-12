import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { canAccess } from './lib/roles'
import AppShell from './components/AppShell'
import Login from './routes/team/Login'
import TwoFactorSetup from './routes/team/TwoFactorSetup'
import TwoFactorChallenge from './routes/team/TwoFactorChallenge'
import DailyDashboard from './routes/team/DailyDashboard'
import ImportOrders from './routes/team/ImportOrders'
import BoatSetup from './routes/team/BoatSetup'
import PierLoad from './routes/team/PierLoad'
import ClaimsQueue from './routes/team/ClaimsQueue'
import ClaimDetail from './routes/team/ClaimDetail'
import OrderDetail from './routes/team/OrderDetail'
import PackOrder from './routes/team/PackOrder'
import LabelSheet from './routes/team/LabelSheet'
import CustomerOrderView from './routes/customer/CustomerOrderView'
import LineRegister from './routes/customer/LineRegister'

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
            <Route path="/order/:id" element={<OrderDetail />} />
            <Route path="/order/:id/pack" element={<PackOrder />} />
            <Route path="/order/:id/label" element={<LabelSheet />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
