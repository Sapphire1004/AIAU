import { describe, expect, it } from 'vitest'
import { aiNoteOperationsSchema, generatedPlanSchema } from '@/lib/schemas'

describe('aiNoteOperationsSchema', () => {
  it('accepts add, update, and hold operations', () => {
    const result = aiNoteOperationsSchema.safeParse({
      operations: [
        {
          op: 'add',
          title: '美術館',
          attrs: { time_hint: '午前' },
          source: '00000000-0000-4000-8000-000000000001',
        },
        {
          op: 'update',
          target: '00000000-0000-4000-8000-000000000002',
          attrs: { cost: 8000 },
          source: '00000000-0000-4000-8000-000000000003',
        },
        {
          op: 'hold',
          target: '00000000-0000-4000-8000-000000000004',
          reason: '参加者が撤回したため',
          source: '00000000-0000-4000-8000-000000000005',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects delete operations', () => {
    const result = aiNoteOperationsSchema.safeParse({
      operations: [
        {
          op: 'delete',
          target: '00000000-0000-4000-8000-000000000002',
          source: '00000000-0000-4000-8000-000000000003',
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('generatedPlanSchema', () => {
  it('rejects slots whose end is not after the start', () => {
    const result = generatedPlanSchema.safeParse({
      slots: [
        {
          start_at: '2026-08-16T10:00:00+09:00',
          end_at: '2026-08-16T09:00:00+09:00',
          options: [
            {
              title: '美術館',
              start_at: '2026-08-16T10:00:00+09:00',
              end_at: '2026-08-16T11:00:00+09:00',
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})
