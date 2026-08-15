import { requireData, throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

export async function createShareLink(planId: string, expiresAt?: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_share_link', {
    p_plan_id: planId,
    p_expires_at: expiresAt,
  })
  throwIfError(error)
  return requireData(data, 'Share link creation did not return a token')
}

export async function revokeShareLink(shareLinkId: string): Promise<void> {
  const { error } = await getSupabase().rpc('revoke_share_link', { p_share_link_id: shareLinkId })
  throwIfError(error)
}

export async function getPublicPlan(token: string): Promise<Json> {
  const { data, error } = await getSupabase().functions.invoke('public-plan', { body: { token } })
  throwIfError(error)
  return requireData(data, 'Public plan was not returned') as Json
}

export async function exportPlanIcs(planId: string): Promise<Blob> {
  const { data, error } = await getSupabase().functions.invoke('export-ics', { body: { plan_id: planId } })
  throwIfError(error)
  if (data instanceof Blob) {
    return data
  }
  return new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'text/calendar' })
}
