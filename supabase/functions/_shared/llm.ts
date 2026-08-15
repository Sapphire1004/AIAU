export async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function callJsonModel(system: string, input: unknown): Promise<unknown | null> {
  const url = Deno.env.get('LLM_API_URL')
  const key = Deno.env.get('LLM_API_KEY')
  const model = Deno.env.get('LLM_MODEL')
  if (!url || !key || !model) {
    return null
  }

  const response = await fetch(url, {
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
      temperature: 0,
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!response.ok) {
    throw new Error(`LLM_REQUEST_FAILED:${response.status}`)
  }

  const result = await response.json()
  const content = result?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('LLM_RESPONSE_INVALID')
  }
  return JSON.parse(content)
}
