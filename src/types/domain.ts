import type { Database, Json } from '@/types/database'

export type Tables = Database['public']['Tables']
export type Trip = Tables['trips']['Row']
export type TripMember = Tables['trip_members']['Row']
export type TripInvite = Tables['trip_invites']['Row']
export type Message = Tables['messages']['Row']
export type Note = Tables['notes']['Row']
export type NoteInsert = Tables['notes']['Insert']
export type Plan = Tables['plans']['Row']
export type PlanSlot = Tables['plan_slots']['Row']
export type PlanOption = Tables['plan_options']['Row']
export type Vote = Tables['votes']['Row']
export type PlanVersion = Tables['plan_versions']['Row']
export type PersonalEvent = Tables['personal_events']['Row']
export type Notification = Tables['notifications']['Row']
export type OfflineConflict = Tables['offline_conflicts']['Row']

export type NoteAttributes = {
  address?: string
  lat?: number
  lng?: number
  duration?: number
  time_hint?: string
  cost?: number | string
  memo?: string | null
}

export type PlanCommand = {
  type:
    | 'add_slot'
    | 'add_option'
    | 'update_option'
    | 'move_option'
    | 'resize_option'
    | 'calendar_edit'
    | 'delete_option'
    | 'refresh_from_note'
    | 'unconfirm'
    | 'replace_plan'
  payload: Json
  summary?: string
}

export type PlanSnapshot = {
  slots: PlanSlot[]
  options: PlanOption[]
}

export type CalendarEvent = {
  id: string
  source: 'plan' | 'personal'
  planId: string | null
  noteId: string | null
  title: string
  startAt: string
  endAt: string
  allDay: boolean
  kind: string
  attrs: Json
  revision: number
}

export type CreateTripInput = {
  title: string
  nickname: string
  startsAt?: string
  endsAt?: string
  timezone?: string
  origin?: string
  budget?: number
  currency?: string
}

export type CreateTripResult = {
  tripId: string
  planId: string
  inviteToken: string
}
