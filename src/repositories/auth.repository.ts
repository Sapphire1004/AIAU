import type { Session, User } from '@supabase/supabase-js'
import { throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'

export async function ensureAnonymousSession(): Promise<Session> {
  const supabase = getSupabase()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  throwIfError(sessionError)

  if (sessionData.session) {
    return sessionData.session
  }

  const { data, error } = await supabase.auth.signInAnonymously()
  throwIfError(error)
  if (!data.session) {
    throw new Error('Anonymous sign-in did not return a session')
  }
  return data.session
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await getSupabase().auth.getUser()
  throwIfError(error)
  return data.user
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  throwIfError(error)
}
