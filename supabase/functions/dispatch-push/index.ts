import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import webpush from 'npm:web-push@3.6.7'
import { z } from 'npm:zod@4.4.3'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'
import { createServiceClient, requireUser } from '../_shared/supabase.ts'

const requestSchema = z.object({ notification_id: z.string().uuid() })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = requestSchema.parse(await request.json())
    const authorization = request.headers.get('Authorization') ?? ''
    const serviceToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const isService = authorization === `Bearer ${serviceToken}`
    const service = createServiceClient()

    let userId: string
    if (isService) {
      const notification = await service
        .from('notifications')
        .select('user_id')
        .eq('id', body.notification_id)
        .single()
      if (notification.error) throw notification.error
      userId = notification.data.user_id
    } else {
      const { client, user } = await requireUser(request)
      const notification = await client
        .from('notifications')
        .select('user_id')
        .eq('id', body.notification_id)
        .single()
      if (notification.error) throw notification.error
      userId = user.id
    }

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'
    if (!publicKey || !privateKey) {
      return jsonResponse({ error: 'PUSH_NOT_CONFIGURED' }, 503)
    }
    webpush.setVapidDetails(subject, publicKey, privateKey)

    const [notificationResult, subscriptionsResult] = await Promise.all([
      service.from('notifications').select('id,title,body,link,type').eq('id', body.notification_id).eq('user_id', userId).single(),
      service.from('push_subscriptions').select('*').eq('user_id', userId).is('revoked_at', null),
    ])
    if (notificationResult.error) throw notificationResult.error
    if (subscriptionsResult.error) throw subscriptionsResult.error

    let sent = 0
    let revoked = 0
    const payload = JSON.stringify(notificationResult.data)
    for (const subscription of subscriptionsResult.data ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
          },
          payload,
        )
        sent += 1
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await service
            .from('push_subscriptions')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', subscription.id)
          revoked += 1
          continue
        }
        throw error
      }
    }

    return jsonResponse({ sent, revoked })
  } catch (error) {
    return errorResponse(error)
  }
})
