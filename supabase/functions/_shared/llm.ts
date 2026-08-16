export async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const openAIEndpoint = 'https://api.openai.com/v1/chat/completions'
const defaultOpenAIModel = 'gpt-4o-mini'
const openAITimeoutMs = 45_000
const openAIMaxCompletionTokens = 4_096

export type OpenAIErrorCode =
  | 'OPENAI_API_KEY_NOT_CONFIGURED'
  | 'OPENAI_AUTHENTICATION_FAILED'
  | 'OPENAI_FORBIDDEN'
  | 'OPENAI_RATE_LIMITED'
  | 'OPENAI_REQUEST_TIMEOUT'
  | 'OPENAI_REQUEST_FAILED'
  | 'OPENAI_RESPONSE_INVALID'

export class OpenAIError extends Error {
  constructor(
    readonly code: OpenAIErrorCode,
    readonly status: number,
  ) {
    super(code)
    this.name = 'OpenAIError'
  }
}

export async function callOpenAIJson(system: string, input: unknown): Promise<unknown> {
  const key = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!key) throw new OpenAIError('OPENAI_API_KEY_NOT_CONFIGURED', 503)
  const model = Deno.env.get('OPENAI_MODEL')?.trim() || defaultOpenAIModel
  // gpt-5 系・o 系の reasoning モデルは temperature の指定（既定値 1 以外）を拒否する
  const isReasoningModel = /^(gpt-5|o\d)/.test(model)

  let response: Response
  try {
    response = await fetch(openAIEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(input) },
        ],
        response_format: { type: 'json_object' },
        ...(isReasoningModel ? {} : { temperature: 0 }),
        max_completion_tokens: isReasoningModel ? 16_384 : openAIMaxCompletionTokens,
        n: 1,
        store: false,
      }),
      signal: AbortSignal.timeout(openAITimeoutMs),
    })
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new OpenAIError('OPENAI_REQUEST_TIMEOUT', 504)
    }
    throw new OpenAIError('OPENAI_REQUEST_FAILED', 502)
  }

  if (response.status === 401) throw new OpenAIError('OPENAI_AUTHENTICATION_FAILED', 502)
  if (response.status === 403) throw new OpenAIError('OPENAI_FORBIDDEN', 502)
  if (response.status === 429) throw new OpenAIError('OPENAI_RATE_LIMITED', 429)
  if (!response.ok) throw new OpenAIError('OPENAI_REQUEST_FAILED', 502)

  let result: { choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }> }
  try {
    result = await response.json()
  } catch {
    throw new OpenAIError('OPENAI_RESPONSE_INVALID', 502)
  }
  const choice = result.choices?.[0]
  const content = choice?.message?.content
  if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim()) {
    throw new OpenAIError('OPENAI_RESPONSE_INVALID', 502)
  }
  try {
    return JSON.parse(content) as unknown
  } catch {
    throw new OpenAIError('OPENAI_RESPONSE_INVALID', 502)
  }
}
