import { describe, expect, it } from 'vitest'
import { AVATAR_TONE_COUNT, avatarToneClass, avatarToneIndex } from '@/lib/avatar-tone'

describe('avatarToneIndex', () => {
  it('returns the same tone for the same seed', () => {
    const seed = '9f6e1b9c-2b4f-4f0c-9b17-2f18f5e0a111'
    expect(avatarToneIndex(seed)).toBe(avatarToneIndex(seed))
    expect(avatarToneClass(seed)).toBe(`avatar-tone-${avatarToneIndex(seed)}`)
  })

  it('stays inside the palette range for any seed', () => {
    const seeds = ['', 'a', '匿名ユーザー', '🎉', 'x'.repeat(200), crypto.randomUUID()]
    for (const seed of seeds) {
      const index = avatarToneIndex(seed)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(AVATAR_TONE_COUNT)
      expect(Number.isInteger(index)).toBe(true)
    }
  })

  it('spreads different seeds across the palette', () => {
    const tones = new Set(
      Array.from({ length: 60 }, (_, index) => avatarToneIndex(`user-${index}`)),
    )
    expect(tones.size).toBe(AVATAR_TONE_COUNT)
  })
})
