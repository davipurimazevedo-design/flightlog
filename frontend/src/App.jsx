import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Logbook from './pages/Logbook'
import MapView from './pages/MapView'
import Aircraft from './pages/Aircraft'
import FlightForm from './pages/FlightForm'
import Statistics from './pages/Statistics'
import FlightDetail from './pages/FlightDetail'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ErrorBoundary from './components/ErrorBoundary'
import PendingReviewModal from './components/PendingReviewModal'
import { Protected, RequireAdmin } from './components/ProtectedRoute'
import { usePendingFlights } from './hooks/usePendingFlights'
import { markReviewed } from './api'

// Layout principal do app (sidebar + páginas), já autenticado.
function AppShell() {
  const { pending, dismiss, dismissAll } = usePendingFlights()

  const handleConfirm = (id) => {
    markReviewed(id).catch(() => {})
    dismiss(id)
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <ErrorBoundary>
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
        </ErrorBoundary>
      </main>

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
    <Routes>
      {/* Rotas públicas de autenticação */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Todo o resto exige sessão + conta ativa (ou libera, se auth desligada) */}
      <Route path="/*" element={<Protected><AppShell /></Protected>} />
    </Routes>
  )
}
