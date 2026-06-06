import axios from 'axios'

// Dev → localhost:8000 explícito
// Electron (file://) → backend local na porta 8000
// Web prod (servido pelo FastAPI) → mesma origem (BASE vazio = URL relativa)
const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'
const BASE = import.meta.env.DEV || isFileProtocol ? 'http://127.0.0.1:8000' : ''
const api = axios.create({ baseURL: BASE })

export const getStats = () => api.get('/flights/stats').then(r => r.data)
export const getDetailedStats = (params = {}) => api.get('/flights/detailed-stats', { params }).then(r => r.data)
export const getMapRoutes = () => api.get('/flights/map-routes').then(r => r.data)
export const getFlights = (params = {}) => api.get('/flights/', { params }).then(r => r.data)
export const countFlights = (params = {}) => api.get('/flights/count', { params }).then(r => r.data)
export const getFlight = (id) => api.get(`/flights/${id}`).then(r => r.data)
export const createFlight = (data) => api.post('/flights/', data).then(r => r.data)
export const updateFlight = (id, data) => api.put(`/flights/${id}`, data).then(r => r.data)
export const deleteFlight = (id) => api.delete(`/flights/${id}`)

export const getAircraft = () => api.get('/aircraft/').then(r => r.data)
export const createAircraft = (data) => api.post('/aircraft/', data).then(r => r.data)
export const deleteAircraft = (id) => api.delete(`/aircraft/${id}`)

export const searchAirports = (q) => api.get('/airports/search', { params: { q } }).then(r => r.data)
export const getAirport = (icao) => api.get(`/airports/${icao}`).then(r => r.data)
