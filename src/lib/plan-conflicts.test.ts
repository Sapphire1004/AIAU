import { describe, expect, it } from 'vitest'
import { clusterByOverlap, overlaps } from '@/lib/plan-conflicts'
import { mergeOverlappingSlots } from '../../supabase/functions/_shared/conflicts'

function span(startAt: string, endAt: string, key = startAt) {
  return { key, start: Date.parse(startAt), end: Date.parse(endAt) }
}

describe('overlaps', () => {
  it('treats intersecting intervals as overlapping', () => {
    expect(overlaps(span('2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00'), span('2026-08-20T13:15:00+09:00', '2026-08-20T14:00:00+09:00'))).toBe(true)
  })

  it('treats a shared boundary as not overlapping', () => {
    expect(overlaps(span('2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00'), span('2026-08-20T13:30:00+09:00', '2026-08-20T14:00:00+09:00'))).toBe(false)
  })

  it('compares instants, so equal times written in different offsets overlap', () => {
    expect(overlaps(span('2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00'), span('2026-08-20T04:00:00Z', '2026-08-20T05:00:00Z'))).toBe(true)
  })
})

describe('clusterByOverlap', () => {
  it('groups overlapping intervals and keeps separate ones alone', () => {
    const yanaka = span('2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00', 'slot-a')
    const cafe = span('2026-08-20T13:15:00+09:00', '2026-08-20T14:00:00+09:00', 'slot-b')
    const dinner = span('2026-08-20T18:00:00+09:00', '2026-08-20T19:00:00+09:00', 'slot-c')

    expect(clusterByOverlap([dinner, cafe, yanaka])).toEqual([[yanaka, cafe], [dinner]])
  })

  it('keeps chained overlaps in a single group', () => {
    const first = span('2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00', 'slot-a')
    const second = span('2026-08-20T13:15:00+09:00', '2026-08-20T14:00:00+09:00', 'slot-b')
    const third = span('2026-08-20T13:50:00+09:00', '2026-08-20T15:00:00+09:00', 'slot-c')

    expect(clusterByOverlap([first, second, third])).toEqual([[first, second, third]])
  })

  it('does not group the same clock time on different dates', () => {
    const firstDay = span('2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00', 'slot-a')
    const secondDay = span('2026-08-21T12:30:00+09:00', '2026-08-21T13:30:00+09:00', 'slot-b')

    expect(clusterByOverlap([firstDay, secondDay])).toEqual([[firstDay], [secondDay]])
  })

  it('keeps items that share a key apart when their times do not overlap', () => {
    const morning = span('2026-08-20T09:00:00+09:00', '2026-08-20T10:00:00+09:00', 'slot-a')
    const evening = span('2026-08-20T19:00:00+09:00', '2026-08-20T20:00:00+09:00', 'slot-a')

    expect(clusterByOverlap([morning, evening])).toEqual([[morning], [evening]])
  })

  it('groups exempt items that share a key, since their times cannot be compared', () => {
    const stay = { ...span('2026-08-20T00:00:00+09:00', '2026-08-21T00:00:00+09:00', 'slot-a'), overlapExempt: true }
    const trip = { ...span('2026-08-21T00:00:00+09:00', '2026-08-22T00:00:00+09:00', 'slot-a'), overlapExempt: true }

    expect(clusterByOverlap([stay, trip])).toEqual([[stay, trip]])
  })

  it('keeps exempt items such as all-day plans out of overlap grouping', () => {
    const allDay = { ...span('2026-08-20T00:00:00+09:00', '2026-08-21T00:00:00+09:00', 'slot-a'), overlapExempt: true }
    const lunch = span('2026-08-20T12:30:00+09:00', '2026-08-20T13:30:00+09:00', 'slot-b')

    expect(clusterByOverlap([allDay, lunch])).toEqual([[allDay], [lunch]])
  })
})

describe('mergeOverlappingSlots', () => {
  const yanaka = {
    title: '谷中銀座で食べ歩き',
    start_at: '2026-08-20T12:30:00+09:00',
    end_at: '2026-08-20T13:30:00+09:00',
  }
  const cafe = {
    title: '古書店カフェで休憩',
    start_at: '2026-08-20T13:15:00+09:00',
    end_at: '2026-08-20T14:00:00+09:00',
  }
  const dinner = {
    title: '下町の居酒屋',
    start_at: '2026-08-20T18:00:00+09:00',
    end_at: '2026-08-20T19:30:00+09:00',
  }

  it('merges overlapping options from separate slots into one votable slot', () => {
    const merged = mergeOverlappingSlots([
      { start_at: yanaka.start_at, end_at: yanaka.end_at, options: [yanaka] },
      { start_at: cafe.start_at, end_at: cafe.end_at, options: [cafe] },
      { start_at: dinner.start_at, end_at: dinner.end_at, options: [dinner] },
    ])

    expect(merged).toEqual([
      { start_at: yanaka.start_at, end_at: cafe.end_at, options: [yanaka, cafe] },
      { start_at: dinner.start_at, end_at: dinner.end_at, options: [dinner] },
    ])
  })

  it('leaves back-to-back options in their own slots', () => {
    const next = { title: '夕食', start_at: yanaka.end_at, end_at: '2026-08-20T14:30:00+09:00' }
    const merged = mergeOverlappingSlots([
      { start_at: yanaka.start_at, end_at: yanaka.end_at, options: [yanaka] },
      { start_at: next.start_at, end_at: next.end_at, options: [next] },
    ])

    expect(merged.map((slot) => slot.options)).toEqual([[yanaka], [next]])
  })

  it('splits options of one slot when their times do not overlap', () => {
    const merged = mergeOverlappingSlots([
      { start_at: yanaka.start_at, end_at: dinner.end_at, options: [yanaka, dinner] },
    ])

    expect(merged).toEqual([
      { start_at: yanaka.start_at, end_at: yanaka.end_at, options: [yanaka] },
      { start_at: dinner.start_at, end_at: dinner.end_at, options: [dinner] },
    ])
  })

  it('does not merge all-day options with timed options', () => {
    const allDay = {
      title: '滞在日',
      start_at: '2026-08-20T00:00:00+09:00',
      end_at: '2026-08-21T00:00:00+09:00',
      kind: 'all_day',
    }
    const merged = mergeOverlappingSlots([
      { start_at: allDay.start_at, end_at: allDay.end_at, options: [allDay] },
      { start_at: yanaka.start_at, end_at: yanaka.end_at, options: [yanaka] },
    ])

    expect(merged.map((slot) => slot.options)).toEqual([[allDay], [yanaka]])
  })
})
