import { createClient } from 'npm:@supabase/supabase-js@2.112.3'

function requireEnvironment(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

export function createUserClient(request: Request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization) {
    throw new Error('AUTH_REQUIRED')
  }
  return createClient(requireEnvironment('SUPABASE_URL'), requireEnvironment('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function createServiceClient() {
  return createClient(requireEnvironment('SUPABASE_URL'), requireEnvironment('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function requireUser(request: Request) {
  const client = createUserClient(request)
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) {
    throw new Error('AUTH_REQUIRED')
  }
  return { client, user: data.user }
}
