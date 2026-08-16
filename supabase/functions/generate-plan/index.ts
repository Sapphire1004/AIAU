import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod@4.4.3'
import { mergeOverlappingSlots } from '../_shared/conflicts.ts'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { callOpenAIJson, OpenAIError, sha256 } from '../_shared/llm.ts'
import { generatedPlan } from '../_shared/schemas.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

const requestSchema = z.object({
  trip_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  expected_version: z.number().int().nonnegative(),
  regenerate: z.boolean().default(false),
  idempotency_key: z.string().min(1).max(200),
})

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
    const system = [
      'Return exactly one JSON object with a slots array and no other text.',
      'Each slot must be {"start_at":"ISO 8601 with offset","end_at":"ISO 8601 with offset","options":[...]}.',
      'Each option must be {"note_id":"existing note UUID or null","title":"string","start_at":"ISO 8601 with offset","end_at":"ISO 8601 with offset","kind":"activity|travel|all_day|placeholder","attrs":{},"reason":"string"}.',
      'Every activity option must reference an id from notes in note_id and must represent that note. Never invent restaurants, destinations, shopping, or activities that are not in notes.',
      'Only travel or placeholder options may use a null note_id. Include every active note exactly once as an activity.',
      'Honor duration and time_hint from each note attrs, including exact requested clock times.',
      'Include at least one option in every slot. Respect the trip start, trip end, timezone, budget, and every busy interval.',
      'Do not overlap slots or busy intervals. Ensure every end_at is after start_at.',
      'When ideas compete for the same time range, return them as multiple options inside one slot so members can vote, never as separate slots.',
      'Activities that happen one after another belong in separate slots, even when they are close in time. A slot with several options always means members must pick one of them.',
      'Notes that cannot all happen belong in one slot as competing options, for example several lunch wishes such as curry and yakiniku, or a food wish and a named restaurant serving that food.',
      'Account for travel time between places. Whenever two consecutive activities are at different places, put a travel option between them in its own slot, with kind "travel", note_id null, and a title naming both ends such as "東京タワー→浅草寺の移動".',
      'Estimate each travel duration from the real distance between the two places using the transport members would realistically take in that area, and never leave an activity starting at the exact moment the previous one ends unless both are at the same place or within a few minutes on foot.',
      'Never hide travel time inside an activity option and never let a travel option overlap an activity or a busy interval. Put the assumed transport mode in the travel option attrs as "mode" and the estimated minutes as "duration", and state the assumption in reason. Do not invent addresses, fares, or exact routes.',
      'When trip.origin is set, start the first travel option of the trip from it and end the last travel option of the trip at it.',
      'A travel option is never a competing candidate, so keep every travel option alone in its slot.',
    ].join(' ')
    let parsed: z.infer<typeof generatedPlan>
    try {
      parsed = generatedPlan.parse(await callOpenAIJson(system, input))
    } catch (error) {
      if (error instanceof OpenAIError) throw error
      if (error instanceof z.ZodError) throw new OpenAIError('OPENAI_RESPONSE_INVALID', 502)
      throw error
    }

    const noteIds = new Set(notesResult.data.map((note) => note.id))
    for (const slot of parsed.slots) {
      for (const option of slot.options) {
        if (option.note_id && !noteIds.has(option.note_id)) {
          throw new OpenAIError('OPENAI_RESPONSE_INVALID', 502)
        }
        if (option.kind === 'activity' && !option.note_id) {
          throw new OpenAIError('OPENAI_RESPONSE_INVALID', 502)
        }
      }
    }

    // OpenAIが重なる予定を別slotへ返した場合も、同じ時間帯は1slotへまとめて投票できる競合候補にする。
    const slots = mergeOverlappingSlots(parsed.slots)

    const applied = await client.rpc('apply_plan_command', {
      p_plan_id: body.plan_id,
      p_expected_version: body.expected_version,
      p_command: {
        type: 'replace_plan',
        summary: body.regenerate ? 'AIでプランを再生成' : 'AIでプランを生成',
        payload: { slots, regenerate: body.regenerate },
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
          error_code: error instanceof OpenAIError ? error.code : 'GENERATE_PLAN_FAILED',
          error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
        })
        .eq('id', runId)
    }
    return errorResponse(error, error instanceof OpenAIError ? error.status : 400)
  }
})
