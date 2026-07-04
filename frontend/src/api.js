import axios from 'axios'
import { supabase, AUTH_ENABLED } from './lib/supabase'

// Resolução do backend:
// 1. VITE_API_URL (web na nuvem → backend no Render)
// 2. dev local → 127.0.0.1:8000
const BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
const api = axios.create({ baseURL: BASE })

// Anexa o token do Supabase em toda requisição (quando a auth está ativa).
if (AUTH_ENABLED) {
  api.interceptors.request.use(async (cfg) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) cfg.headers.Authorization = `Bearer ${token}`
    return cfg
  })
}

export const getStats = () => api.get('/flights/stats').then(r => r.data)
export const getDetailedStats = (params = {}) => api.get('/flights/detailed-stats', { params }).then(r => r.data)
export const getHoursByYear = () => api.get('/flights/hours-by-year').then(r => r.data)
export const getMapRoutes = (params = {}) => api.get('/flights/map-routes', { params }).then(r => r.data)
export const getFlights = (params = {}) => api.get('/flights/', { params }).then(r => r.data)
export const countFlights = (params = {}) => api.get('/flights/count', { params }).then(r => r.data)
export const getFlight = (id) => api.get(`/flights/${id}`).then(r => r.data)
export const createFlight = (data) => api.post('/flights/', data).then(r => r.data)
export const updateFlight = (id, data) => api.put(`/flights/${id}`, data).then(r => r.data)
export const deleteFlight = (id) => api.delete(`/flights/${id}`)
export const getPendingReview = () => api.get('/flights/pending-review').then(r => r.data)
export const markReviewed = (id) => api.patch(`/flights/${id}/mark-reviewed`).then(r => r.data)

export const getAircraft = () => api.get('/aircraft/').then(r => r.data)
export const createAircraft = (data) => api.post('/aircraft/', data).then(r => r.data)
export const deleteAircraft = (id) => api.delete(`/aircraft/${id}`)

export const searchAirports = (q) => api.get('/airports/search', { params: { q } }).then(r => r.data)
export const getAirport = (icao) => api.get(`/airports/${icao}`).then(r => r.data)

// ── Conta / perfil ────────────────────────────────────────────────────────────
export const getMe = () => api.get('/me').then(r => r.data)
export const updateMe = (data) => api.patch('/me', data).then(r => r.data)

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminListUsers = () => api.get('/admin/users').then(r => r.data)
export const adminApprove = (id) => api.post(`/admin/users/${id}/approve`).then(r => r.data)
export const adminDisable = (id) => api.post(`/admin/users/${id}/disable`).then(r => r.data)
export const adminPromote = (id) => api.post(`/admin/users/${id}/promote`).then(r => r.data)
export const adminResetPassword = (id) => api.post(`/admin/users/${id}/reset-password`).then(r => r.data)
export const adminDeleteUser = (id) => api.delete(`/admin/users/${id}`)
