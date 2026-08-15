export const INVITE_QUERY_PARAM = 'invite'

export function buildInviteUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin)
  return `${base}/?${INVITE_QUERY_PARAM}=${encodeURIComponent(token)}`
}

export function readInviteTokenFromSearch(search: string): string | null {
  const token = new URLSearchParams(search).get(INVITE_QUERY_PARAM)?.trim()
  return token ? token : null
}
