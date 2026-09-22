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

// ── Retrospectiva: ano/mês ESCOLHIDOS (buildRange acima é sempre relativo a hoje) ──

/** Ano cheio: buildYearRange(2026) → 01/01/2026 a 31/12/2026 */
export function buildYearRange(year) {
  const d = new Date(Number(year), 0, 1)
  return { date_from: format(startOfYear(d), 'yyyy-MM-dd'), date_to: format(endOfYear(d), 'yyyy-MM-dd') }
}

/** Mês cheio: buildMonthRange(2026, 9) → 01/09/2026 a 30/09/2026 (mês 1-12) */
export function buildMonthRange(year, month) {
  const d = new Date(Number(year), Number(month) - 1, 1)
  return { date_from: format(startOfMonth(d), 'yyyy-MM-dd'), date_to: format(endOfMonth(d), 'yyyy-MM-dd') }
}

export const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
