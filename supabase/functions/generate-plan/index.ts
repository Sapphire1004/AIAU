import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod@4.4.3'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { callJsonModel, sha256 } from '../_shared/llm.ts'
import { generatedPlan } from '../_shared/schemas.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

const requestSchema = z.object({
  trip_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  expected_version: z.number().int().nonnegative(),
  regenerate: z.boolean().default(false),
  idempotency_key: z.string().min(1).max(200),
})

type Note = {
  id: string
  title: string
  attrs: Record<string, unknown>
  x: number
  y: number
}

type BusyEvent = { start_at: string; end_at: string }

function durationMinutes(note: Note): number {
  const value = note.attrs.duration
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  if (typeof value === 'string') {
    const minutes = value.match(/([0-9]+)\s*分/)
    if (minutes) return Number(minutes[1])
    const hours = value.match(/([0-9]+(?:\.[0-9]+)?)\s*時間/)
    if (hours) return Math.round(Number(hours[1]) * 60)
  }
  return 90
}

function nextFreeStart(candidate: Date, duration: number, busy: BusyEvent[]): Date {
  let current = new Date(candidate)
  for (;;) {
    const end = new Date(current.getTime() + duration * 60_000)
    const collision = busy.find(
      (event) => new Date(event.start_at).getTime() < end.getTime() && new Date(event.end_at).getTime() > current.getTime(),
    )
    if (!collision) return current
    current = new Date(collision.end_at)
  }
}

function fallbackPlan(notes: Note[], trip: { starts_at: string | null; ends_at: string | null }, busy: BusyEvent[]) {
  const defaultStart = new Date()
  defaultStart.setUTCDate(defaultStart.getUTCDate() + 1)
  defaultStart.setUTCHours(0, 0, 0, 0)
  let cursor = trip.starts_at ? new Date(trip.starts_at) : defaultStart
  const tripEnd = trip.ends_at ? new Date(trip.ends_at) : new Date(cursor.getTime() + 12 * 60 * 60_000)
  const slots: Array<Record<string, unknown>> = []

  for (const note of [...notes].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const duration = durationMinutes(note)
    cursor = nextFreeStart(cursor, duration, busy)
    const end = new Date(cursor.getTime() + duration * 60_000)
    if (end > tripEnd) break
    slots.push({
      start_at: cursor.toISOString(),
      end_at: end.toISOString(),
      options: [
        {
          note_id: note.id,
          title: note.title,
          start_at: cursor.toISOString(),
          end_at: end.toISOString(),
          kind: 'activity',
          attrs: note.attrs,
          reason: '付箋の順序・希望時間・所要時間をもとに配置',
        },
      ],
    })
    cursor = new Date(end.getTime() + 30 * 60_000)
  }

  return { slots }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let runId: string | null = null
  try {
    const body = requestSchema.parse(await request.json())
    const { client, user } = await requireUser(request)

    const membership = await client
      .from('trip_members')
      .select('trip_id')
      .eq('trip_id', body.trip_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (membership.error || !membership.data) {
      return jsonResponse({ error: 'NOT_A_MEMBER' }, 403)
    }

    const [tripResult, planResult, notesResult, busyResult] = await Promise.all([
      client.from('trips').select('id,starts_at,ends_at,timezone,origin,budget,currency').eq('id', body.trip_id).single(),
      client.from('plans').select('id,current_version').eq('id', body.plan_id).eq('trip_id', body.trip_id).single(),
      client
        .from('notes')
        .select('id,title,attrs,x,y')
        .eq('trip_id', body.trip_id)
        .eq('status', 'active')
        .is('deleted_at', null),
      client
        .from('personal_events')
        .select('start_at,end_at')
        .is('deleted_at', null)
        .order('start_at'),
    ])
    if (tripResult.error) throw tripResult.error
    if (planResult.error) throw planResult.error
    if (notesResult.error) throw notesResult.error
    if (busyResult.error) throw busyResult.error
    if (planResult.data.current_version !== body.expected_version) {
      return jsonResponse({ error: 'VERSION_CONFLICT' }, 409)
    }

    const inputHash = await sha256(
      JSON.stringify({
        trip: tripResult.data,
        notes: notesResult.data.map((note) => note.id).sort(),
        busy: busyResult.data,
        version: body.expected_version,
      }),
    )
    const runResult = await client
      .from('ai_runs')
      .insert({
        trip_id: body.trip_id,
        kind: 'generate_plan',
        requested_by: user.id,
        idempotency_key: body.idempotency_key,
        input_hash: inputHash,
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .select('id,status')
      .single()

    if (runResult.error?.code === '23505') {
      const existingRun = await client
        .from('ai_runs')
        .select('id,status')
        .eq('trip_id', body.trip_id)
        .eq('kind', 'generate_plan')
        .eq('idempotency_key', body.idempotency_key)
        .single()
      if (existingRun.error) throw existingRun.error
      return jsonResponse({ status: existingRun.data.status, run_id: existingRun.data.id, idempotent: true })
    }
    if (runResult.error) throw runResult.error
    runId = runResult.data.id

    const input = {
      trip: tripResult.data,
      notes: notesResult.data,
      busy_intervals: busyResult.data,
    }
    const system =
      'Create a feasible travel timeline as JSON {slots:[{start_at,end_at,options:[...]}]}. Use ISO 8601 offsets. Each option needs note_id, title, start_at, end_at, kind, attrs, reason. Respect busy intervals and trip bounds.'
    const modelResult = await callJsonModel(system, input)
    const parsed = generatedPlan.parse(
      modelResult ??
        fallbackPlan(
          notesResult.data as Note[],
          tripResult.data,
          busyResult.data as BusyEvent[],
        ),
    )

    const applied = await client.rpc('apply_plan_command', {
      p_plan_id: body.plan_id,
      p_expected_version: body.expected_version,
      p_command: {
        type: 'replace_plan',
        summary: body.regenerate ? 'AIでプランを再生成' : 'AIでプランを生成',
        payload: { slots: parsed.slots, regenerate: body.regenerate },
      },
    })
    if (applied.error) throw applied.error

    const service = createServiceClient()
    await service
      .from('ai_runs')
      .update({ status: 'completed', finished_at: new Date().toISOString() })
      .eq('id', runId)
    return jsonResponse({ run_id: runId, result: applied.data })
  } catch (error) {
    if (runId) {
      const service = createServiceClient()
      await service
        .from('ai_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_code: 'GENERATE_PLAN_FAILED',
          error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
        })
        .eq('id', runId)
    }
    return errorResponse(error)
  }
})
