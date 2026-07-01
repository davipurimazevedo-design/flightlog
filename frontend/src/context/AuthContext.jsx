import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, AUTH_ENABLED } from '../lib/supabase'
import { getMe } from '../api'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)   // { id, email, role, status, full_name }
  const [loading, setLoading] = useState(AUTH_ENABLED)

  // Busca o perfil (role/status) do backend depois que há sessão.
  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getMe())
    } catch {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    if (!AUTH_ENABLED) return

    // Sessão inicial
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await refreshProfile()
      setLoading(false)
    })

    // Reage a login/logout/refresh de token
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      if (newSession) await refreshProfile()
      else setProfile(null)
    })

    return () => sub.subscription.unsubscribe()
  }, [refreshProfile])

  // ── Ações expostas ──────────────────────────────────────────────────────────
  const login = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signup = (email, password) =>
    supabase.auth.signUp({ email, password })

  const logout = () => supabase.auth.signOut()

  const resetPassword = (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

  const updatePassword = (newPassword) =>
    supabase.auth.updateUser({ password: newPassword })

  const value = {
    authEnabled: AUTH_ENABLED,
    session,
    user: session?.user ?? null,
    profile,
    loading,
    refreshProfile,
    login,
    signup,
    logout,
    resetPassword,
    updatePassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
