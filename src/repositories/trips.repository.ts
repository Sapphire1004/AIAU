import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { requireData, throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { CreateTripInput, CreateTripResult, Plan, Trip, TripInvite, TripMember } from '@/types/domain'

export async function listTrips(): Promise<Trip[]> {
  const { data, error } = await getSupabase().from('trips').select('*').order('updated_at', { ascending: false })
  throwIfError(error)
  return data ?? []
}

export async function getTrip(tripId: string): Promise<Trip> {
  const { data, error } = await getSupabase().from('trips').select('*').eq('id', tripId).single()
  throwIfError(error)
  return requireData(data, 'Trip was not found')
}

export async function getTripMembers(tripId: string): Promise<TripMember[]> {
  const { data, error } = await getSupabase()
    .from('trip_members')
    .select('*')
    .eq('trip_id', tripId)
    .order('joined_at')
  throwIfError(error)
  return data ?? []
}

export type TripMemberSubscriber = 'board' | 'header'

export function subscribeToTripMembers(
  tripId: string,
  subscriber: TripMemberSubscriber,
  onChange: (payload: RealtimePostgresChangesPayload<TripMember>) => void,
): RealtimeChannel {
  return getSupabase()
    .channel(`trip:${tripId}:members:${subscriber}`)
    .on<TripMember>(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trip_members', filter: `trip_id=eq.${tripId}` },
      onChange,
    )
    .subscribe()
}

export async function createTrip(input: CreateTripInput): Promise<CreateTripResult> {
  const { data, error } = await getSupabase().rpc('create_trip', {
    p_title: input.title,
    p_nickname: input.nickname,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_timezone: input.timezone,
    p_origin: input.origin,
    p_budget: input.budget,
    p_currency: input.currency,
  })
  throwIfError(error)
  const result = data?.[0]
  if (!result?.trip_id || !result.plan_id || !result.invite_token) {
    throw new Error('Trip creation returned invalid data')
  }
  return {
    tripId: result.trip_id,
    planId: result.plan_id,
    inviteToken: result.invite_token,
  }
}

export async function joinTrip(inviteToken: string, nickname: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('join_trip', {
    p_invite_token: inviteToken,
    p_nickname: nickname,
  })
  throwIfError(error)
  return requireData(data, 'Trip join did not return a trip ID')
}

export async function getPlanForTrip(tripId: string): Promise<Plan> {
  const { data, error } = await getSupabase().from('plans').select('*').eq('trip_id', tripId).single()
  throwIfError(error)
  return requireData(data, 'Plan was not found')
}

export async function listInvites(tripId: string): Promise<TripInvite[]> {
  const { data, error } = await getSupabase()
    .from('trip_invites')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
  throwIfError(error)
  return data ?? []
}

export async function createInvite(tripId: string, expiresAt?: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_trip_invite', {
    p_trip_id: tripId,
    p_expires_at: expiresAt,
  })
  throwIfError(error)
  return requireData(data, 'Invite creation did not return a token')
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const { error } = await getSupabase().rpc('revoke_trip_invite', { p_invite_id: inviteId })
  throwIfError(error)
}
