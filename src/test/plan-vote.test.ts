import { afterEach, describe, expect, it, vi } from 'vitest'
import { castVote, retractVotes } from '@/repositories/plans.repository'

const { getSupabaseMock } = vi.hoisted(() => ({
  getSupabaseMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabase: getSupabaseMock,
}))

afterEach(() => {
  getSupabaseMock.mockReset()
})

function deleteBuilder(result: { error: unknown }) {
  const calls: { in?: [string, string[]]; eq?: [string, string] } = {}
  const builder = {
    in(column: string, values: string[]) {
      calls.in = [column, values]
      return builder
    },
    eq(column: string, value: string) {
      calls.eq = [column, value]
      return Promise.resolve(result)
    },
  }
  return { builder, calls }
}

describe('vote repository contract', () => {
  it('sends the slot and option the timeline button was rendered for', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { totals: { 'option-1': 1 } }, error: null })
    getSupabaseMock.mockReturnValue({ rpc })

    await expect(castVote('slot-1', 'option-1')).resolves.toEqual({ totals: { 'option-1': 1 } })
    expect(rpc).toHaveBeenCalledWith('cast_vote', { p_slot_id: 'slot-1', p_option_id: 'option-1' })
  })

  it('surfaces RPC failures so the page can show an error instead of staying silent', async () => {
    getSupabaseMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'not a member of this trip' } }),
    })

    await expect(castVote('slot-1', 'option-1')).rejects.toThrow('not a member of this trip')
  })

  it('fails when the RPC returns no totals, keeping the voted state from being faked', async () => {
    getSupabaseMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) })

    await expect(castVote('slot-1', 'option-1')).rejects.toThrow('Vote did not return totals')
  })

  it('retracts only the own votes of the superseded slots of a conflict group', async () => {
    const { builder, calls } = deleteBuilder({ error: null })
    const del = vi.fn().mockReturnValue(builder)
    getSupabaseMock.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: del }) })

    await retractVotes(['slot-b', 'slot-c'], 'user-1')

    expect(del).toHaveBeenCalledTimes(1)
    expect(calls.in).toEqual(['slot_id', ['slot-b', 'slot-c']])
    expect(calls.eq).toEqual(['user_id', 'user-1'])
  })

  it('skips the query when the conflict group lives in a single slot', async () => {
    await retractVotes([], 'user-1')

    expect(getSupabaseMock).not.toHaveBeenCalled()
  })

  it('reports retraction failures so a stale vote is not shown as reflected', async () => {
    const { builder } = deleteBuilder({ error: { message: 'row level security' } })
    getSupabaseMock.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: () => builder }) })

    await expect(retractVotes(['slot-b'], 'user-1')).rejects.toThrow('row level security')
  })
})
