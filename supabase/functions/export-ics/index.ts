import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod@4.4.3'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { requireUser } from '../_shared/supabase.ts'

const requestSchema = z.object({ plan_id: z.string().uuid() })

function escapeText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n')
}

function utcDate(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function dateOnly(value: string): string {
  return new Date(value).toISOString().slice(0, 10).replaceAll('-', '')
}

function foldLine(line: string): string {
  const parts: string[] = []
  let remaining = line
  while (remaining.length > 73) {
    parts.push(remaining.slice(0, 73))
    remaining = ` ${remaining.slice(73)}`
  }
  parts.push(remaining)
  return parts.join('\r\n')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = requestSchema.parse(await request.json())
    const { client } = await requireUser(request)
    const planResult = await client
      .from('plans')
      .select('id,trips!inner(id,title,timezone)')
      .eq('id', body.plan_id)
      .single()
    if (planResult.error) throw planResult.error

    const eventsResult = await client
      .from('plan_slots')
      .select('confirmed_option_id,plan_options!plan_slots_confirmed_option_fkey(id,title,start_at,end_at,kind,attrs)')
      .eq('plan_id', body.plan_id)
      .eq('status', 'confirmed')
      .is('deleted_at', null)
      .order('start_at')
    if (eventsResult.error) throw eventsResult.error

    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AIAU//Travel Plan//JA', 'CALSCALE:GREGORIAN']
    for (const slot of eventsResult.data ?? []) {
      const event = slot.plan_options
      if (!event || event.id !== slot.confirmed_option_id) continue
      const attrs = event.attrs as Record<string, unknown>
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${event.id}@aiau`)
      lines.push(`DTSTAMP:${utcDate(new Date().toISOString())}`)
      if (event.kind === 'all_day') {
        lines.push(`DTSTART;VALUE=DATE:${dateOnly(event.start_at)}`)
        lines.push(`DTEND;VALUE=DATE:${dateOnly(event.end_at)}`)
      } else {
        lines.push(`DTSTART:${utcDate(event.start_at)}`)
        lines.push(`DTEND:${utcDate(event.end_at)}`)
      }
      lines.push(`SUMMARY:${escapeText(event.title)}`)
      if (typeof attrs.address === 'string') lines.push(`LOCATION:${escapeText(attrs.address)}`)
      if (typeof attrs.memo === 'string') lines.push(`DESCRIPTION:${escapeText(attrs.memo)}`)
      lines.push('END:VEVENT')
    }
    lines.push('END:VCALENDAR')

    const calendar = `${lines.map(foldLine).join('\r\n')}\r\n`
    return new Response(calendar, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="aiau-${body.plan_id}.ics"`,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) return jsonResponse({ error: 'INVALID_INPUT' }, 400)
    return errorResponse(error)
  }
})
