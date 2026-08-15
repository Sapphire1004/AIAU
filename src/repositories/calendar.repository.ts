import type { RealtimeChannel } from '@supabase/supabase-js'
import { requireData, throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import type { CalendarEvent, OfflineConflict, PersonalEvent } from '@/types/domain'

export type PersonalEventDraft = {
  id?: string
  title: string
  start_at: string
  end_at: string
  all_day?: boolean
  attrs?: Json
  reminder_minutes?: number | null
  deleted_at?: string | null
}

export type PersonalEventMutationResult =
  | { status: 'applied'; event: PersonalEvent }
  | { status: 'conflict'; conflict_id: string; server: PersonalEvent }

export async function getCalendarFeed(from: string, to: string, timezone: string): Promise<CalendarEvent[]> {
  const { data, error } = await getSupabase().rpc('get_calendar_feed', {
    p_from: from,
    p_to: to,
    p_timezone: timezone,
  })
  throwIfError(error)
  return (data ?? []).map((event) => ({
    id: event.id,
    source: event.source as CalendarEvent['source'],
    planId: event.plan_id ?? null,
    noteId: event.note_id ?? null,
    title: event.title,
    startAt: event.start_at,
    endAt: event.end_at,
    allDay: event.all_day,
    kind: event.kind,
    attrs: event.attrs,
    revision: event.revision,
  }))
}

export async function savePersonalEvent(
  draft: PersonalEventDraft,
  expectedRevision?: number,
): Promise<PersonalEventMutationResult> {
  const { data, error } = await getSupabase().rpc('upsert_personal_event', {
    p_event: draft,
    p_expected_revision: expectedRevision,
  })
  throwIfError(error)
  return requireData(data, 'Personal event mutation did not return data') as PersonalEventMutationResult
}

export async function listOfflineConflicts(): Promise<OfflineConflict[]> {
  const { data, error } = await getSupabase()
    .from('offline_conflicts')
    .select('*')
    .eq('status', 'pending')
    .order('created_at')
  throwIfError(error)
  return data ?? []
}

export async function resolveOfflineConflict(
  conflictId: string,
  resolution: 'local' | 'server',
): Promise<Json> {
  const { data, error } = await getSupabase().rpc('resolve_offline_conflict', {
    p_conflict_id: conflictId,
    p_resolution: resolution,
  })
  throwIfError(error)
  return requireData(data, 'Conflict resolution did not return data')
}

export function subscribeToCalendar(userId: string, onChange: () => void): RealtimeChannel {
  const channel = getSupabase().channel(`user:${userId}:calendar`)
  for (const table of ['personal_events', 'notifications', 'offline_conflicts'] as const) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, onChange)
  }
  return channel.subscribe()
}
