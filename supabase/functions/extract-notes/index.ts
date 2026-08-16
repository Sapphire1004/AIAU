import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod@4.4.3'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { callOpenAIJson, OpenAIError, sha256 } from '../_shared/llm.ts'
import { noteOperations } from '../_shared/schemas.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

const requestSchema = z.object({
  trip_id: z.string().uuid(),
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

    const [notesResult, messagesResult] = await Promise.all([
      client
        .from('notes')
        .select('id,title,attrs,status,user_touched')
        .eq('trip_id', body.trip_id)
        .is('deleted_at', null),
      client
        .from('messages')
        .select('id,author_name,text')
        .eq('trip_id', body.trip_id)
        .eq('processed', false)
        .is('deleted_at', null)
        .order('created_at')
        .limit(100),
    ])
    if (notesResult.error) throw notesResult.error
    if (messagesResult.error) throw messagesResult.error
    if (!messagesResult.data?.length) {
      return jsonResponse({ status: 'completed', applied: 0 })
    }

    const messageIds = messagesResult.data.map((message) => message.id).sort()
    const noteIds = (notesResult.data ?? []).map((note) => note.id).sort()
    const inputHash = await sha256(JSON.stringify({ trip: body.trip_id, messageIds, noteIds }))

    const runResult = await client
      .from('ai_runs')
      .insert({
        trip_id: body.trip_id,
        kind: 'extract_notes',
        requested_by: user.id,
        idempotency_key: body.idempotency_key,
        input_hash: inputHash,
      })
      .select('id,status')
      .single()

    if (runResult.error?.code === '23505') {
      const existingRun = await client
        .from('ai_runs')
        .select('id,status')
        .eq('trip_id', body.trip_id)
        .eq('kind', 'extract_notes')
        .eq('idempotency_key', body.idempotency_key)
        .single()
      if (existingRun.error) throw existingRun.error
      return jsonResponse({ status: existingRun.data.status, run_id: existingRun.data.id, idempotent: true })
    }
    if (runResult.error) throw runResult.error
    runId = runResult.data.id

    const input = {
      existing_notes: (notesResult.data ?? []).map((note) => ({
        id: note.id,
        title: note.title,
        attrs: note.attrs,
        status: note.status,
        user_touched: note.user_touched,
      })),
      new_messages: messagesResult.data.map((message) => ({
        id: message.id,
        author: message.author_name,
        text: message.text,
      })),
    }
    const system = [
      'Return exactly one JSON object with an operations array and no other text.',
      'Use only these exact operation shapes:',
      'add: {"op":"add","title":"string","memo":"string","attrs":{},"source":"message UUID"}. Use an empty string for memo when there is no memo; do not use null.',
      'update: {"op":"update","target":"existing note UUID","title":"string if changed","memo":"string or null if changed","attrs":{},"source":"message UUID"}.',
      'hold: {"op":"hold","target":"existing note UUID","reason":"string","source":"message UUID"}.',
      'The attrs object may contain only address, lat, lng, duration, time_hint, and cost.',
      'Preserve an exact requested clock time or time of day in attrs.time_hint. Store duration as minutes and cost as a number when stated.',
      'The source value must be an id from new_messages. The target value must be an id from existing_notes.',
      'Add a note for every message that states a place the trip members want to visit or a thing they want to do, even when it is a named spot such as a temple or a restaurant.',
      'Also add a note when the wish has no proper place name, for example a nearby hot spring, a cafe with a nice view, or somewhere to see fireflies. Treat vague wishes as valid plan candidates.',
      'Keep the requested wording of the wish in the title, and put extra conditions or nuance from the message in memo.',
      'Never invent a place name, address, lat, lng, cost, or duration that the message does not state. Omit attrs you do not know instead of guessing.',
      'Interpret Japanese context words such as yappari, mo, ato, and chikaba together with the other new_messages and existing_notes so that follow-up wishes are still captured.',
      'Return an empty operations array only for casual conversation that expresses no wish about where to go or what to do.',
      'Never use keys named operation or source_message_uuid. Never return delete.',
      'Never update or hold a note whose user_touched value is true.',
    ].join(' ')
    let parsed: z.infer<typeof noteOperations>
    try {
      parsed = noteOperations.parse(await callOpenAIJson(system, input))
    } catch (error) {
      if (error instanceof OpenAIError) throw error
      if (error instanceof z.ZodError) throw new OpenAIError('OPENAI_RESPONSE_INVALID', 502)
      throw error
    }

    const applied = await client.rpc('apply_note_operations', {
      p_trip_id: body.trip_id,
      p_run_id: runId,
      p_operations: parsed.operations,
    })
    if (applied.error) throw applied.error
    return jsonResponse({ run_id: runId, ...applied.data })
  } catch (error) {
    if (runId) {
      const service = createServiceClient()
      await service
        .from('ai_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          error_code: error instanceof OpenAIError ? error.code : 'EXTRACT_NOTES_FAILED',
          error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
        })
        .eq('id', runId)
    }
    return errorResponse(error, error instanceof OpenAIError ? error.status : 400)
  }
})
