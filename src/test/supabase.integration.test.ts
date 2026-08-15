import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'

const url = process.env.SUPABASE_TEST_URL
const key = process.env.SUPABASE_TEST_KEY
const integration = url && key ? describe : describe.skip

integration('Supabase integration', () => {
  it('runs the collaborative trip flow with RLS, voting, history, and calendar data', async () => {
    const ownerClient = createClient<Database>(url!, key!)
    const memberClient = createClient<Database>(url!, key!)

    const ownerAuth = await ownerClient.auth.signInAnonymously()
    expect(ownerAuth.error).toBeNull()
    const owner = ownerAuth.data.user!

    const tripResult = await ownerClient.rpc('create_trip', {
      p_title: '統合テスト旅行',
      p_nickname: 'owner',
      p_starts_at: '2026-08-16T00:00:00Z',
      p_ends_at: '2026-08-17T00:00:00Z',
      p_timezone: 'Asia/Tokyo',
    })
    expect(tripResult.error).toBeNull()
    const trip = tripResult.data![0]

    const profileResult = await ownerClient.from('profiles').select('id').eq('id', owner.id).single()
    expect(profileResult.error).toBeNull()

    const memberAuth = await memberClient.auth.signInAnonymously()
    expect(memberAuth.error).toBeNull()

    const hiddenTrip = await memberClient.from('trips').select('id').eq('id', trip.trip_id)
    expect(hiddenTrip.error).toBeNull()
    expect(hiddenTrip.data).toHaveLength(0)

    const joinResult = await memberClient.rpc('join_trip', {
      p_invite_token: trip.invite_token,
      p_nickname: 'member',
    })
    expect(joinResult.error).toBeNull()
    expect(joinResult.data).toBe(trip.trip_id)

    const visibleTrip = await memberClient.from('trips').select('id').eq('id', trip.trip_id)
    expect(visibleTrip.data).toHaveLength(1)

    const messageResult = await ownerClient
      .from('messages')
      .insert({
        trip_id: trip.trip_id,
        author_id: owner.id,
        author_name: 'owner',
        text: '午前に美術館へ行きたい',
      })
      .select()
      .single()
    expect(messageResult.error).toBeNull()

    const extractResult = await ownerClient.functions.invoke('extract-notes', {
      body: { trip_id: trip.trip_id, idempotency_key: crypto.randomUUID() },
    })
    expect(extractResult.error).toBeNull()

    const noteResult = await ownerClient
      .from('notes')
      .select('*')
      .eq('trip_id', trip.trip_id)
      .single()
    expect(noteResult.error).toBeNull()

    const generateResult = await ownerClient.functions.invoke('generate-plan', {
      body: {
        trip_id: trip.trip_id,
        plan_id: trip.plan_id,
        expected_version: 0,
        regenerate: false,
        idempotency_key: crypto.randomUUID(),
      },
    })
    expect(generateResult.error).toBeNull()

    const slotResult = await ownerClient
      .from('plan_slots')
      .select('*, plan_options!plan_options_slot_id_fkey(*)')
      .eq('plan_id', trip.plan_id)
      .single()
    expect(slotResult.error).toBeNull()
    const option = slotResult.data!.plan_options[0]

    const voteResult = await memberClient.rpc('cast_vote', {
      p_slot_id: slotResult.data!.id,
      p_option_id: option.id,
    })
    expect(voteResult.error).toBeNull()

    const confirmResult = await memberClient.rpc('confirm_option', {
      p_slot_id: slotResult.data!.id,
      p_option_id: option.id,
      p_expected_version: 1,
    })
    expect(confirmResult.error).toBeNull()

    const personalResult = await ownerClient.rpc('upsert_personal_event', {
      p_event: {
        title: '個人予定',
        start_at: '2026-08-16T03:00:00Z',
        end_at: '2026-08-16T04:00:00Z',
      },
    })
    expect(personalResult.error).toBeNull()

    const feedResult = await ownerClient.rpc('get_calendar_feed', {
      p_from: '2026-08-16T00:00:00Z',
      p_to: '2026-08-17T00:00:00Z',
      p_timezone: 'Asia/Tokyo',
    })
    expect(feedResult.error).toBeNull()
    expect(feedResult.data?.map((event) => event.source).sort()).toEqual(['personal', 'plan'])

    const updateResult = await ownerClient.rpc('apply_plan_command', {
      p_plan_id: trip.plan_id,
      p_expected_version: 2,
      p_command: {
        type: 'update_option',
        summary: 'タイトル変更',
        payload: { option_id: option.id, title: '美術館（更新）' },
      },
    })
    expect(updateResult.error).toBeNull()

    const restoreResult = await ownerClient.rpc('restore_plan_version', {
      p_plan_id: trip.plan_id,
      p_version: 2,
      p_expected_version: 3,
    })
    expect(restoreResult.error).toBeNull()

    const votesAfterRestore = await ownerClient
      .from('votes')
      .select('*')
      .eq('slot_id', slotResult.data!.id)
    expect(votesAfterRestore.data).toHaveLength(1)

    const shareResult = await ownerClient.rpc('create_share_link', { p_plan_id: trip.plan_id })
    expect(shareResult.error).toBeNull()

    const publicPlan = await ownerClient.functions.invoke('public-plan', {
      body: { token: shareResult.data! },
    })
    expect(publicPlan.error).toBeNull()
    expect(publicPlan.data).toMatchObject({ trip: { id: trip.trip_id } })

    const icsResult = await ownerClient.functions.invoke('export-ics', {
      body: { plan_id: trip.plan_id },
    })
    expect(icsResult.error).toBeNull()
    const ics = icsResult.data instanceof Blob ? await icsResult.data.text() : String(icsResult.data)
    expect(ics).toContain('BEGIN:VCALENDAR')
  }, 30_000)
})
