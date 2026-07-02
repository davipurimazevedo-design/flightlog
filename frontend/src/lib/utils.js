import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ── Helpers de tempo/data (fonte única — antes havia 6 cópias divergentes) ───

/** Minutos → "HH:MM" (ex: 105 → "01:45") */
export function minutesToHHMM(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes || 0))
  const hh = String(Math.floor(mins / 60)).padStart(2, '0')
  const mm = String(mins % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Horas decimais → "HH:MM" (ex: 1.75 → "01:45") */
export function hoursToHHMM(decimalHours) {
  return minutesToHHMM((decimalHours || 0) * 60)
}

/** Duração entre dois timestamps ISO → "HH:MM" */
export function durationHHMM(depISO, arrISO) {
  return minutesToHHMM((new Date(arrISO) - new Date(depISO)) / 60000)
}

/** ISO "2026-06-01..." → "01/06/2026" (slice direto, sem new Date — evita bug de timezone) */
export function fmtDateBR(iso) {
  if (!iso) return ''
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
