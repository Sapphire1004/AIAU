import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod@4.4.3'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { callJsonModel, sha256 } from '../_shared/llm.ts'
import { noteOperations } from '../_shared/schemas.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

const requestSchema = z.object({
  trip_id: z.string().uuid(),
  idempotency_key: z.string().min(1).max(200),
})

type ExistingNote = {
  id: string
  title: string
  attrs: Record<string, unknown>
  status: 'active' | 'held'
  user_touched: boolean
}

type NewMessage = { id: string; author_name: string; text: string }

function extractAttributes(text: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  const cost = text.match(/([0-9][0-9,]*)\s*円/)
  const minutes = text.match(/([0-9]+)\s*分/)
  const hours = text.match(/([0-9]+(?:\.[0-9]+)?)\s*時間/)
  const timeHint = text.match(/午前|午後|朝|昼|夕方|夜/)
  if (cost) attrs.cost = Number(cost[1].replaceAll(',', ''))
  if (minutes) attrs.duration = Number(minutes[1])
  if (hours) attrs.duration = Math.round(Number(hours[1]) * 60)
  if (timeHint) attrs.time_hint = timeHint[0]
  return attrs
}

function fallbackOperations(existingNotes: ExistingNote[], messages: NewMessage[]) {
  const operations: Array<Record<string, unknown>> = []
  for (const message of messages) {
    const existing = existingNotes.find((note) => message.text.includes(note.title))
    const isWithdrawal = /なし|やめ|行かない|行けない|微妙|撤回/.test(message.text)
    if (existing) {
      if (existing.user_touched) continue
      if (isWithdrawal) {
        operations.push({
          op: 'hold',
          target: existing.id,
          reason: message.text.slice(0, 500),
          source: message.id,
        })
      } else {
        operations.push({
          op: 'update',
          target: existing.id,
          attrs: extractAttributes(message.text),
          source: message.id,
        })
      }
      continue
    }
    if (isWithdrawal) continue

    const title = message.text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/行ってみたい|行きたい|食べたい|気になる|したい/g, '')
      .replace(/[。！？!?]/g, ' ')
      .trim()
      .slice(0, 60)
    if (title.length < 2) continue
    operations.push({
      op: 'add',
      title,
      memo: '',
      attrs: extractAttributes(message.text),
      source: message.id,
    })
  }
  return { operations }
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
    const system =
      'Extract travel ideas as JSON {operations:[...]}. Allowed operations are add, update, hold. Every operation needs a source message UUID. Never return delete. Never update or hold user_touched notes.'
    const modelResult = await callJsonModel(system, input)
    const parsed = noteOperations.parse(
      modelResult ??
        fallbackOperations(
          input.existing_notes as ExistingNote[],
          messagesResult.data as NewMessage[],
        ),
    )

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
          error_code: 'EXTRACT_NOTES_FAILED',
          error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
        })
        .eq('id', runId)
    }
    return errorResponse(error)
  }
})
