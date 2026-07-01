import { createClient } from '@supabase/supabase-js'

// Config vem do ambiente da Vercel (VITE_*). Sem as chaves (build desktop/dev),
// a auth fica desligada e o app funciona como hoje — igual ao AUTH_ENABLED do backend.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const AUTH_ENABLED = !!(url && anonKey)

// Só cria o cliente quando há config; caso contrário fica null.
export const supabase = AUTH_ENABLED ? createClient(url, anonKey) : null
