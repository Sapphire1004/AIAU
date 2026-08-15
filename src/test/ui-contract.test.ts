import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { matchPath, MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '@/components/layout/app-shell'
import { HomePage } from '@/pages/home-page'
import { getCalendarFeed } from '@/repositories/calendar.repository'
import { createTrip, joinTrip, listTrips } from '@/repositories/trips.repository'

const { getSupabaseMock } = vi.hoisted(() => ({
  getSupabaseMock: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabase: getSupabaseMock,
}))

afterEach(() => {
  getSupabaseMock.mockReset()
})

function renderAt(path: string, child: ReactNode): string {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, child))
}

function readAttribute(markup: string, attribute: string): string[] {
  const pattern = new RegExp(`\\s${attribute}="([^"]+)"`, 'g')
  return Array.from(markup.matchAll(pattern), (match) => match[1])
}

describe('UI route contract', () => {
  it('keeps trip navigation aligned with the registered route shapes', () => {
    const tripId = 'trip-contract-id'
    const markup = renderAt(
      `/trips/${tripId}/ideas`,
      createElement(AppShell, { tripId }, createElement('p', null, 'route content')),
    )
    const hrefs = readAttribute(markup, 'href')

    expect(hrefs).toEqual(['/', `/trips/${tripId}/ideas`, `/trips/${tripId}/plan`, '/calendar'])
    expect(matchPath({ path: '/trips/:tripId/ideas', end: true }, hrefs[1])?.params.tripId).toBe(tripId)
    expect(matchPath({ path: '/trips/:tripId/plan', end: true }, hrefs[2])?.params.tripId).toBe(tripId)
    expect(matchPath({ path: '/calendar', end: true }, hrefs[3])).not.toBeNull()
  })

  it('renders repository-shaped home forms without embedding trip records', () => {
    const markup = renderAt('/', createElement(HomePage))

    expect(readAttribute(markup, 'name')).toEqual(['title', 'nickname', 'startsAt', 'endsAt', 'token', 'nickname'])
    expect(markup.match(/<form/g)).toHaveLength(2)
    expect(markup).toContain('role="status"')
    expect(markup).toContain('読み込み中')
    expect(markup).not.toContain('まだ旅行がありません。')
    expect(getSupabaseMock).not.toHaveBeenCalled()
  })
})

describe('page repository contract', () => {
  it('returns an empty collection instead of manufacturing trip fixtures', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: null })
    const select = vi.fn().mockReturnValue({ order })
    const from = vi.fn().mockReturnValue({ select })
    getSupabaseMock.mockReturnValue({ from })

    await expect(listTrips()).resolves.toEqual([])
    expect(from).toHaveBeenCalledWith('trips')
    expect(select).toHaveBeenCalledWith('*')
    expect(order).toHaveBeenCalledWith('updated_at', { ascending: false })
  })

  it('maps create and join RPC values between page and database naming', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ trip_id: 'trip-id', plan_id: 'plan-id', invite_token: 'invite-token' }],
        error: null,
      })
      .mockResolvedValueOnce({ data: 'joined-trip-id', error: null })
    getSupabaseMock.mockReturnValue({ rpc })

    await expect(
      createTrip({
        title: 'Contract trip',
        nickname: 'owner',
        startsAt: '2026-08-16T01:00:00.000Z',
        endsAt: '2026-08-16T09:00:00.000Z',
        timezone: 'Asia/Tokyo',
        origin: 'Tokyo',
        budget: 50_000,
        currency: 'JPY',
      }),
    ).resolves.toEqual({ tripId: 'trip-id', planId: 'plan-id', inviteToken: 'invite-token' })
    await expect(joinTrip('invite-token', 'member')).resolves.toBe('joined-trip-id')

    expect(rpc).toHaveBeenNthCalledWith(1, 'create_trip', {
      p_title: 'Contract trip',
      p_nickname: 'owner',
      p_starts_at: '2026-08-16T01:00:00.000Z',
      p_ends_at: '2026-08-16T09:00:00.000Z',
      p_timezone: 'Asia/Tokyo',
      p_origin: 'Tokyo',
      p_budget: 50_000,
      p_currency: 'JPY',
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'join_trip', {
      p_invite_token: 'invite-token',
      p_nickname: 'member',
    })
  })

  it('normalizes calendar RPC rows for the page model', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'event-id',
          source: 'plan',
          plan_id: 'plan-id',
          note_id: 'note-id',
          title: 'Museum',
          start_at: '2026-08-16T01:00:00.000Z',
          end_at: '2026-08-16T02:00:00.000Z',
          all_day: false,
          kind: 'activity',
          attrs: { address: 'Tokyo' },
          revision: 3,
        },
      ],
      error: null,
    })
    getSupabaseMock.mockReturnValue({ rpc })

    await expect(
      getCalendarFeed('2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', 'Asia/Tokyo'),
    ).resolves.toEqual([
      {
        id: 'event-id',
        source: 'plan',
        planId: 'plan-id',
        noteId: 'note-id',
        title: 'Museum',
        startAt: '2026-08-16T01:00:00.000Z',
        endAt: '2026-08-16T02:00:00.000Z',
        allDay: false,
        kind: 'activity',
        attrs: { address: 'Tokyo' },
        revision: 3,
      },
    ])
    expect(rpc).toHaveBeenCalledWith('get_calendar_feed', {
      p_from: '2026-08-01T00:00:00.000Z',
      p_to: '2026-09-01T00:00:00.000Z',
      p_timezone: 'Asia/Tokyo',
    })
  })
})
