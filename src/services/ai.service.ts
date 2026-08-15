import { throwIfError } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

const openAIErrorMessages: Record<string, string> = {
  OPENAI_API_KEY_NOT_CONFIGURED: 'AI機能が設定されていません。管理者がOpenAI APIキーを設定してください。',
  OPENAI_AUTHENTICATION_FAILED: 'OpenAI APIキーが無効です。管理者が設定を確認してください。',
  OPENAI_FORBIDDEN: 'OpenAI APIまたはモデルの利用権限がありません。管理者が設定を確認してください。',
  OPENAI_RATE_LIMITED: 'OpenAI APIの利用上限に達しました。しばらく待ってからもう一度お試しください。',
  OPENAI_REQUEST_TIMEOUT: 'OpenAI APIが時間内に応答しませんでした。もう一度お試しください。',
  OPENAI_REQUEST_FAILED: 'OpenAI APIへの接続に失敗しました。しばらく待ってからもう一度お試しください。',
  OPENAI_RESPONSE_INVALID: 'OpenAI APIから有効な結果を取得できませんでした。もう一度お試しください。',
}

async function throwIfFunctionError(error: { message: string; context?: unknown } | null): Promise<void> {
  if (!error) return
  const response = error.context
  let code: string | null = null
  if (response instanceof Response) {
    try {
      const payload = (await response.clone().json()) as { error?: unknown }
      if (typeof payload.error === 'string') code = payload.error
    } catch {
      code = null
    }
  }
  if (code && openAIErrorMessages[code]) throw new Error(openAIErrorMessages[code])
  throwIfError(error)
}

export async function extractNotes(tripId: string, idempotencyKey: string): Promise<Json> {
  const { data, error } = await getSupabase().functions.invoke('extract-notes', {
    body: { trip_id: tripId, idempotency_key: idempotencyKey },
  })
  await throwIfFunctionError(error)
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
  await throwIfFunctionError(error)
  return data as Json
}
