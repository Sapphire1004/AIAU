import { throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

export async function extractNotes(tripId: string, idempotencyKey: string): Promise<Json> {
  const { data, error } = await getSupabase().functions.invoke('extract-notes', {
    body: { trip_id: tripId, idempotency_key: idempotencyKey },
  })
  throwIfError(error)
  return data as Json
}

export async function generatePlan(
  tripId: string,
  planId: string,
  expectedVersion: number,
  regenerate = false,
): Promise<Json> {
  const { data, error } = await getSupabase().functions.invoke('generate-plan', {
    body: {
      trip_id: tripId,
      plan_id: planId,
      expected_version: expectedVersion,
      regenerate,
      idempotency_key: crypto.randomUUID(),
    },
  })
  throwIfError(error)
  return data as Json
}
