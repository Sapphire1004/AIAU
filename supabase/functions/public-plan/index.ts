import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { z } from 'npm:zod@4.4.3'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { createServiceClient } from '../_shared/supabase.ts'

const requestSchema = z.object({ token: z.string().min(32).max(256) })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = requestSchema.parse(await request.json())
    const { data, error } = await createServiceClient().rpc('get_public_plan', {
      p_share_token: body.token,
    })
    if (error) {
      const status = error.message.includes('RATE_LIMITED') ? 429 : 404
      return jsonResponse({ error: status === 429 ? 'RATE_LIMITED' : 'NOT_FOUND' }, status)
    }
    return jsonResponse(data)
  } catch (error) {
    return errorResponse(error)
  }
})
