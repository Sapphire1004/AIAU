import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireData, throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { Message } from '@/types/domain'

export async function listMessages(tripId: string): Promise<Message[]> {
  const { data, error } = await getSupabase()
    .from('messages')
    .select('*')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('created_at')
  throwIfError(error)
  return data ?? []
}

export async function sendMessage(
  tripId: string,
  authorId: string,
  authorName: string,
  text: string,
): Promise<Message> {
  const { data, error } = await getSupabase()
    .from('messages')
    .insert({ trip_id: tripId, author_id: authorId, author_name: authorName, text })
    .select()
    .single()
  throwIfError(error)
  return requireData(data, 'Message creation did not return data')
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await getSupabase().from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId)
  throwIfError(error)
}

export function subscribeToMessages(
  tripId: string,
  onChange: (payload: RealtimePostgresChangesPayload<Message>) => void,
): RealtimeChannel {
  return getSupabase()
    .channel(`trip:${tripId}:messages`)
    .on<Message>(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` },
      onChange,
    )
    .subscribe()
}
