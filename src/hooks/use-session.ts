import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ensureAnonymousSession } from '@/repositories/auth.repository'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    ensureAnonymousSession()
      .then((value) => {
        if (active) setSession(value)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '認証に失敗しました')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data } = getSupabase().auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return { session, loading, error, configured: isSupabaseConfigured }
}
