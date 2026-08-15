import { throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { Notification } from '@/types/domain'

export async function listNotifications(unreadOnly = false): Promise<Notification[]> {
  let query = getSupabase().from('notifications').select('*').order('created_at', { ascending: false })
  if (unreadOnly) {
    query = query.is('read_at', null)
  }
  const { data, error } = await query
  throwIfError(error)
  return data ?? []
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
  throwIfError(error)
}

export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const { data: userData, error: userError } = await getSupabase().auth.getUser()
  throwIfError(userError)
  const user = userData.user
  if (!user) {
    throw new Error('Authentication is required')
  }
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Push subscription is incomplete')
  }
  const supabase = getSupabase()
  const { data: existing, error: findError } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', json.endpoint)
    .maybeSingle()
  throwIfError(findError)

  const values = {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth_key: json.keys.auth,
    expires_at: json.expirationTime ? new Date(json.expirationTime).toISOString() : null,
    revoked_at: null,
  }
  const result = existing
    ? await supabase.from('push_subscriptions').update(values).eq('id', existing.id)
    : await supabase.from('push_subscriptions').insert({ ...values, user_id: user.id })
  throwIfError(result.error)
}

export async function revokePushSubscription(endpoint: string): Promise<void> {
  const { error } = await getSupabase()
    .from('push_subscriptions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('endpoint', endpoint)
  throwIfError(error)
}
