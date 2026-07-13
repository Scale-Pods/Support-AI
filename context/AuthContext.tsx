'use client'
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@/lib/types'

interface AuthContextType {
  user: any | null
  profile: User | null
  token: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  getFreshToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<any>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [token, setToken]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: { user: verifiedUser }, error } = await supabase.auth.getUser()
        if (verifiedUser) {
          setUser(verifiedUser)
          setToken(session.access_token)
          await loadProfile(verifiedUser.id, session.access_token)
        } else {
          if (error) console.warn('Session invalid on init:', error.message)
          await supabase.auth.signOut()
        }
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setUser(null)
        setProfile(null)
        setToken(null)
        if (typeof window !== 'undefined') window.location.href = '/'
        return
      }

      if (event === 'TOKEN_REFRESHED') {
        if (session) {
          setToken(session.access_token)
          setUser(session.user)
        }
        return
      }

      if (session) {
        setUser(session.user)
        setToken(session.access_token)
        await loadProfile(session.user.id, session.access_token)
      } else {
        setUser(null)
        setProfile(null)
        setToken(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string, accessToken: string) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) {
      const profile = data as User
      if (profile.product_id) {
        const { data: product } = await supabase
          .from('products')
          .select('name, slug')
          .eq('id', profile.product_id)
          .single()
        if (product) profile.products = product
      }
      setProfile(profile)
    }
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message || null
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setToken(null)
    window.location.href = '/'
  }

  const getFreshToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, token, loading, signIn, signOut, getFreshToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
