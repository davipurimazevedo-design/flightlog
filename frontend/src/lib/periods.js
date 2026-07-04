import { format, startOfYear, endOfYear, startOfMonth, endOfMonth, subMonths } from 'date-fns'

// Filtros de período compartilhados (Estatísticas e Mapa de Rotas)
export const PERIODS = [
  { label: 'Ano atual',     id: 'year' },
  { label: 'Mês atual',     id: 'month' },
  { label: 'Últimos 12 m',  id: '12m' },
  { label: 'Personalizado', id: 'custom' },
  { label: 'Tudo',          id: 'all' },
]

/** id do período → { date_from, date_to } (vazio para 'all' e 'custom'). */
export function buildRange(id) {
  const now = new Date()
  if (id === 'year')  return { date_from: format(startOfYear(now), 'yyyy-MM-dd'), date_to: format(endOfYear(now), 'yyyy-MM-dd') }
  if (id === 'month') return { date_from: format(startOfMonth(now), 'yyyy-MM-dd'), date_to: format(endOfMonth(now), 'yyyy-MM-dd') }
  if (id === '12m')   return { date_from: format(subMonths(now, 12), 'yyyy-MM-dd'), date_to: format(now, 'yyyy-MM-dd') }
  return {}
}
