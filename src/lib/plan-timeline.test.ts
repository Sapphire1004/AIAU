import { describe, expect, it } from 'vitest'
import { buildTimeline, supersededSlotIds } from '@/lib/plan-timeline'
import type { PlanOption, PlanSlot } from '@/types/domain'

function slot(id: string, startAt: string, endAt: string, overrides: Partial<PlanSlot> = {}): PlanSlot {
  return {
    confirmed_option_id: null,
    created_at: startAt,
    deleted_at: null,
    end_at: endAt,
    id,
    plan_id: 'plan-1',
    revision: 1,
    start_at: startAt,
    status: 'open',
    updated_at: startAt,
    ...overrides,
  }
}

function option(
  id: string,
  slotId: string,
  startAt: string,
  endAt: string,
  overrides: Partial<PlanOption> = {},
): PlanOption {
  return {
    attrs: {},
    created_at: startAt,
    deleted_at: null,
    end_at: endAt,
    id,
    kind: 'spot',
    note_id: null,
    reason: null,
    revision: 1,
    slot_id: slotId,
    start_at: startAt,
    title: id,
    updated_at: startAt,
    user_touched: false,
    ...overrides,
  }
}

function timelineOf(slots: PlanSlot[], options: PlanOption[]) {
  const optionsBySlot = new Map<string, PlanOption[]>()
  for (const entry of options) {
    optionsBySlot.set(entry.slot_id, [...(optionsBySlot.get(entry.slot_id) ?? []), entry])
  }
  return buildTimeline(slots, optionsBySlot)
}

describe('buildTimeline', () => {
  it('treats options in separate slots as a conflict when their times overlap', () => {
    const yanaka = option('yanaka', 'slot-a', '2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00')
    const cafe = option('cafe', 'slot-b', '2026-08-20T13:15:00+09:00', '2026-08-20T14:00:00+09:00')
    const timeline = timelineOf(
      [slot('slot-a', yanaka.start_at, yanaka.end_at), slot('slot-b', cafe.start_at, cafe.end_at)],
      [yanaka, cafe],
    )

    expect(timeline.settledOptions).toEqual([])
    expect(timeline.conflictRows).toHaveLength(1)
    expect(timeline.conflictRows[0][0].entries.map((entry) => entry.option.id)).toEqual(['yanaka', 'cafe'])
  })

  it('keeps back-to-back options out of the conflict rows', () => {
    const lunch = option('lunch', 'slot-a', '2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00')
    const museum = option('museum', 'slot-b', '2026-08-20T13:30:00+09:00', '2026-08-20T14:00:00+09:00')
    const timeline = timelineOf(
      [slot('slot-a', lunch.start_at, lunch.end_at), slot('slot-b', museum.start_at, museum.end_at)],
      [lunch, museum],
    )

    expect(timeline.conflictRows).toEqual([])
    expect(timeline.settledOptions.map((entry) => entry.id)).toEqual(['lunch', 'museum'])
  })

  it('puts a chain of overlapping options into a single conflict group', () => {
    const first = option('first', 'slot-a', '2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00')
    const second = option('second', 'slot-b', '2026-08-20T13:15:00+09:00', '2026-08-20T14:00:00+09:00')
    const third = option('third', 'slot-c', '2026-08-20T13:50:00+09:00', '2026-08-20T15:00:00+09:00')
    const timeline = timelineOf(
      [
        slot('slot-a', first.start_at, first.end_at),
        slot('slot-b', second.start_at, second.end_at),
        slot('slot-c', third.start_at, third.end_at),
      ],
      [first, second, third],
    )

    expect(timeline.conflictRows.flat()).toHaveLength(1)
    expect(timeline.conflictRows[0][0].entries.map((entry) => entry.option.id)).toEqual([
      'first',
      'second',
      'third',
    ])
    expect(timeline.conflictNumbers.size).toBe(1)
  })

  it('does not report a conflict for the same clock time on different days', () => {
    const day1 = option('day1', 'slot-a', '2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00')
    const day2 = option('day2', 'slot-b', '2026-08-21T12:30:00+09:00', '2026-08-21T13:30:00+09:00')
    const timeline = timelineOf(
      [slot('slot-a', day1.start_at, day1.end_at), slot('slot-b', day2.start_at, day2.end_at)],
      [day1, day2],
    )

    expect(timeline.conflictRows).toEqual([])
    expect(timeline.settledOptions.map((entry) => entry.id)).toEqual(['day1', 'day2'])
  })

  it('reports a conflict when the same instant is written with different offsets', () => {
    const tokyo = option('tokyo', 'slot-a', '2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00')
    const utc = option('utc', 'slot-b', '2026-08-20T04:00:00Z', '2026-08-20T05:00:00Z')
    const timeline = timelineOf(
      [slot('slot-a', tokyo.start_at, tokyo.end_at), slot('slot-b', utc.start_at, utc.end_at)],
      [tokyo, utc],
    )

    expect(timeline.conflictRows.flat()).toHaveLength(1)
    expect(timeline.settledOptions).toEqual([])
  })

  it('moves rejected options of a confirmed slot into the rejected row', () => {
    const adopted = option('adopted', 'slot-a', '2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00')
    const rejected = option('rejected', 'slot-a', '2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00')
    const timeline = timelineOf(
      [
        slot('slot-a', adopted.start_at, adopted.end_at, {
          status: 'confirmed',
          confirmed_option_id: 'adopted',
        }),
      ],
      [adopted, rejected],
    )

    expect(timeline.confirmedRows[0][0].entries.map((entry) => entry.option.id)).toEqual(['adopted'])
    expect(timeline.rejectedOptions.map((entry) => entry.option.id)).toEqual(['rejected'])
    expect(timeline.conflictRows).toEqual([])
  })

  it('packs conflict groups that do not overlap into one row', () => {
    const lunchA = option('lunch-a', 'slot-a', '2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00')
    const lunchB = option('lunch-b', 'slot-a', '2026-08-20T12:45:00+09:00', '2026-08-20T13:15:00+09:00')
    const dinnerA = option('dinner-a', 'slot-b', '2026-08-20T18:00:00+09:00', '2026-08-20T19:30:00+09:00')
    const dinnerB = option('dinner-b', 'slot-b', '2026-08-20T18:30:00+09:00', '2026-08-20T20:00:00+09:00')
    const timeline = timelineOf(
      [
        slot('slot-a', lunchA.start_at, lunchA.end_at),
        slot('slot-b', dinnerA.start_at, dinnerB.end_at),
      ],
      [lunchA, lunchB, dinnerA, dinnerB],
    )

    expect(timeline.conflictRows).toHaveLength(1)
    expect(timeline.conflictRows[0]).toHaveLength(2)
    expect([...timeline.conflictNumbers.values()]).toEqual([0, 1])
  })
})

describe('supersededSlotIds', () => {
  it('lists the other slots of a cross-slot conflict group so one member keeps one vote', () => {
    const yanaka = option('yanaka', 'slot-a', '2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00')
    const cafe = option('cafe', 'slot-b', '2026-08-20T13:15:00+09:00', '2026-08-20T14:00:00+09:00')
    const timeline = timelineOf(
      [slot('slot-a', yanaka.start_at, yanaka.end_at), slot('slot-b', cafe.start_at, cafe.end_at)],
      [yanaka, cafe],
    )
    const group = timeline.conflictRows[0][0]

    expect(supersededSlotIds(group, 'slot-a')).toEqual(['slot-b'])
    expect(supersededSlotIds(group, 'slot-b')).toEqual(['slot-a'])
  })
})
