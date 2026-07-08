import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Logbook from './pages/Logbook'
import Aircraft from './pages/Aircraft'
import FlightForm from './pages/FlightForm'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'
import ErrorBoundary from './components/ErrorBoundary'
import BottomNav from './components/BottomNav'
import PendingReviewModal from './components/PendingReviewModal'
import { Protected, RequireAdmin } from './components/ProtectedRoute'
import { usePendingFlights } from './hooks/usePendingFlights'
import { useToast } from './components/Toast'
import { markReviewed } from './api'

// Páginas pesadas em chunks separados (lazy): MapView e FlightDetail puxam o
// maplibre-gl (~300KB), Statistics puxa o recharts (~180KB). Assim o bundle
// inicial fica leve e essas libs só baixam quando a página é visitada.
const MapView = lazy(() => import('./pages/MapView'))
const FlightDetail = lazy(() => import('./pages/FlightDetail'))
const Statistics = lazy(() => import('./pages/Statistics'))
const Admin = lazy(() => import('./pages/Admin'))

const PageLoader = () => (
  <div className="flex items-center justify-center py-24">
    <span className="w-6 h-6 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin" />
  </div>
)

// Layout principal do app (sidebar + páginas), já autenticado.
function AppShell() {
  const { pending, dismiss, dismissAll } = usePendingFlights()
  const toast = useToast()

  const handleConfirm = async (id) => {
    try {
      await markReviewed(id)
      dismiss(id)
    } catch {
      // NÃO remove da lista: a confirmação não foi salva no servidor.
      toast('Não consegui confirmar o voo. Tente novamente.', 'error')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/logbook" element={<Logbook />} />
              <Route path="/map" element={<MapView />} />
              <Route path="/aircraft" element={<Aircraft />} />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/new-flight" element={<FlightForm />} />
              <Route path="/edit-flight/:id" element={<FlightForm />} />
              <Route path="/flight/:id" element={<FlightDetail />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <BottomNav />

      <PendingReviewModal
        flights={pending}
        onConfirm={handleConfirm}
        onDismiss={dismiss}
        onDismissAll={dismissAll}
      />
    </div>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        {/* Rotas públicas de autenticação */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Páginas legais — públicas (linkadas no cadastro e nas Configurações) */}
        <Route path="/privacidade" element={<Privacy />} />
        <Route path="/termos" element={<Terms />} />

        {/* Todo o resto exige sessão + conta ativa (ou libera, se auth desligada) */}
        <Route path="/*" element={<Protected><AppShell /></Protected>} />
      </Routes>
      <Analytics />
    </>
  )
}
