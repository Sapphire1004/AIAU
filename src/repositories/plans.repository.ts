import type { RealtimeChannel } from '@supabase/supabase-js'
import { requireData, throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import type { Plan, PlanCommand, PlanOption, PlanSlot, PlanVersion, Vote } from '@/types/domain'

export type PlanState = {
  plan: Plan
  slots: PlanSlot[]
  options: PlanOption[]
  votes: Vote[]
}

export async function getPlanState(planId: string): Promise<PlanState> {
  const supabase = getSupabase()
  const [planResult, slotsResult, optionsResult, votesResult] = await Promise.all([
    supabase.from('plans').select('*').eq('id', planId).single(),
    supabase.from('plan_slots').select('*').eq('plan_id', planId).is('deleted_at', null).order('start_at'),
    supabase
      .from('plan_options')
      .select('*, plan_slots!plan_options_slot_id_fkey!inner(plan_id)')
      .eq('plan_slots.plan_id', planId)
      .is('deleted_at', null)
      .order('start_at'),
    supabase.from('votes').select('*, plan_slots!inner(plan_id)').eq('plan_slots.plan_id', planId),
  ])
  throwIfError(planResult.error)
  throwIfError(slotsResult.error)
  throwIfError(optionsResult.error)
  throwIfError(votesResult.error)

  return {
    plan: requireData(planResult.data, 'Plan was not found'),
    slots: slotsResult.data ?? [],
    options: (optionsResult.data ?? []).map(({ plan_slots: _planSlots, ...option }) => option),
    votes: (votesResult.data ?? []).map(({ plan_slots: _planSlots, ...vote }) => vote),
  }
}

export async function applyPlanCommand(
  planId: string,
  expectedVersion: number,
  command: PlanCommand,
): Promise<Json> {
  const { data, error } = await getSupabase().rpc('apply_plan_command', {
    p_plan_id: planId,
    p_expected_version: expectedVersion,
    p_command: command,
  })
  throwIfError(error)
  return requireData(data, 'Plan command did not return data')
}

export async function castVote(slotId: string, optionId: string): Promise<Json> {
  const { data, error } = await getSupabase().rpc('cast_vote', {
    p_slot_id: slotId,
    p_option_id: optionId,
  })
  throwIfError(error)
  return requireData(data, 'Vote did not return totals')
}

export async function confirmOption(
  slotId: string,
  optionId: string,
  expectedVersion: number,
): Promise<Json> {
  const { data, error } = await getSupabase().rpc('confirm_option', {
    p_slot_id: slotId,
    p_option_id: optionId,
    p_expected_version: expectedVersion,
  })
  throwIfError(error)
  return requireData(data, 'Confirmation did not return data')
}

export async function listPlanVersions(planId: string): Promise<PlanVersion[]> {
  const { data, error } = await getSupabase()
    .from('plan_versions')
    .select('*')
    .eq('plan_id', planId)
    .order('version', { ascending: false })
  throwIfError(error)
  return data ?? []
}

export async function restorePlanVersion(
  planId: string,
  version: number,
  expectedVersion: number,
): Promise<Json> {
  const { data, error } = await getSupabase().rpc('restore_plan_version', {
    p_plan_id: planId,
    p_version: version,
    p_expected_version: expectedVersion,
  })
  throwIfError(error)
  return requireData(data, 'Restore did not return data')
}

export function subscribeToPlan(planId: string, onChange: () => void): RealtimeChannel {
  const channel = getSupabase().channel(`plan:${planId}`)
  for (const table of ['plan_slots', 'plan_options', 'votes', 'plan_versions'] as const) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
  }
  return channel.subscribe()
}
