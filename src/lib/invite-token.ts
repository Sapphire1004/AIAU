const INVITE_STORAGE_PREFIX = 'aiau:invite:'

export function readInviteToken(tripId: string): string | null {
  try {
    return sessionStorage.getItem(`${INVITE_STORAGE_PREFIX}${tripId}`)
  } catch {
    return null
  }
}

export function storeInviteToken(tripId: string, token: string) {
  try {
    sessionStorage.setItem(`${INVITE_STORAGE_PREFIX}${tripId}`, token)
  } catch {
    // Session storage is unavailable; callers keep the token in memory only.
  }
}

export function forgetInviteToken(tripId: string) {
  try {
    sessionStorage.removeItem(`${INVITE_STORAGE_PREFIX}${tripId}`)
  } catch {
    // Nothing to clean up when session storage is unavailable.
  }
}
