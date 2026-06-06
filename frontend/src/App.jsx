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
import ErrorBoundary from './components/ErrorBoundary'

export default function App() {
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
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}
