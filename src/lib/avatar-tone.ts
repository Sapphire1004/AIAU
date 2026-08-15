export const AVATAR_TONE_COUNT = 6

export function avatarToneIndex(seed: string): number {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.codePointAt(0)!) % 2147483647
  }
  return hash % AVATAR_TONE_COUNT
}

export function avatarToneClass(seed: string): string {
  return `avatar-tone-${avatarToneIndex(seed)}`
}
