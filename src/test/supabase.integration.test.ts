import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database'

const url = process.env.SUPABASE_TEST_URL
const key = process.env.SUPABASE_TEST_KEY
const integration = url && key ? describe : describe.skip
const openAIUnconfiguredIntegration =
  url && key && process.env.SUPABASE_TEST_EXPECT_OPENAI_UNCONFIGURED === 'true' ? it : it.skip
const openAIConfiguredIntegration =
  url && key && process.env.SUPABASE_TEST_EXPECT_OPENAI_CONFIGURED === 'true' ? it : it.skip

async function expectFunctionError(error: unknown, code: string, status: number) {
  expect(error).not.toBeNull()
  const response = (error as { context?: unknown }).context
  if (!(response instanceof Response)) throw new Error('Expected an Edge Function HTTP response')
  expect(response.status).toBe(status)
  expect(await response.clone().json()).toEqual({ error: code })
}

integration('Supabase integration', () => {
  openAIUnconfiguredIntegration('returns explicit errors without creating AI output when OpenAI is not configured', async () => {
    const client = createClient<Database>(url!, key!)
    const auth = await client.auth.signInAnonymously()
    expect(auth.error).toBeNull()
    const user = auth.data.user!

    const tripResult = await client.rpc('create_trip', {
      p_title: 'OpenAI未設定テスト',
      p_nickname: 'owner',
      p_starts_at: '2026-08-16T00:00:00Z',
      p_ends_at: '2026-08-17T00:00:00Z',
      p_timezone: 'Asia/Tokyo',
    })
    expect(tripResult.error).toBeNull()
    const trip = tripResult.data![0]

    const messageResult = await client.from('messages').insert({
      trip_id: trip.trip_id,
      author_id: user.id,
      author_name: 'owner',
      text: '浅草へ行きたい',
    })
    expect(messageResult.error).toBeNull()

    const extractResult = await client.functions.invoke('extract-notes', {
      body: { trip_id: trip.trip_id, idempotency_key: crypto.randomUUID() },
    })
    await expectFunctionError(extractResult.error, 'OPENAI_API_KEY_NOT_CONFIGURED', 503)

    const generateResult = await client.functions.invoke('generate-plan', {
      body: {
        trip_id: trip.trip_id,
        plan_id: trip.plan_id,
        expected_version: 0,
        regenerate: false,
        idempotency_key: crypto.randomUUID(),
      },
    })
    await expectFunctionError(generateResult.error, 'OPENAI_API_KEY_NOT_CONFIGURED', 503)

    const [notesResult, slotsResult] = await Promise.all([
      client.from('notes').select('id').eq('trip_id', trip.trip_id),
      client.from('plan_slots').select('id').eq('plan_id', trip.plan_id),
    ])
    expect(notesResult.data).toEqual([])
    expect(slotsResult.data).toEqual([])
  }, 30_000)

  openAIConfiguredIntegration('creates AI notes and a plan through the real OpenAI API', async () => {
    const client = createClient<Database>(url!, key!)
    const auth = await client.auth.signInAnonymously()
    expect(auth.error).toBeNull()
    const user = auth.data.user!

    const tripResult = await client.rpc('create_trip', {
      p_title: 'OpenAI実APIテスト',
      p_nickname: 'owner',
      p_starts_at: '2026-08-16T00:00:00Z',
      p_ends_at: '2026-08-17T00:00:00Z',
      p_timezone: 'Asia/Tokyo',
      p_origin: '東京駅',
      p_budget: 10_000,
      p_currency: 'JPY',
    })
    expect(tripResult.error).toBeNull()
    const trip = tripResult.data![0]

    const messageResult = await client
      .from('messages')
      .insert({
        trip_id: trip.trip_id,
        author_id: user.id,
        author_name: 'owner',
        text: '浅草の雷門を午前10時に見たい。滞在時間は60分、費用は1000円くらい。',
      })
      .select('id')
      .single()
    expect(messageResult.error).toBeNull()

    const extractResult = await client.functions.invoke('extract-notes', {
      body: { trip_id: trip.trip_id, idempotency_key: crypto.randomUUID() },
    })
    expect(extractResult.error).toBeNull()

    const notesResult = await client
      .from('notes')
      .select('id,title,origin,status,source_message_id,attrs')
      .eq('trip_id', trip.trip_id)
      .is('deleted_at', null)
    expect(notesResult.error).toBeNull()
    const notes = notesResult.data ?? []
    expect(notes.length).toBeGreaterThan(0)
    expect(notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: 'ai',
          status: 'active',
          source_message_id: messageResult.data!.id,
          attrs: expect.objectContaining({ cost: 1000, duration: 60, time_hint: expect.any(String) }),
        }),
      ]),
    )
    expect(notes.every((note) => note.title.trim().length > 0)).toBe(true)

    const generateResult = await client.functions.invoke('generate-plan', {
      body: {
        trip_id: trip.trip_id,
        plan_id: trip.plan_id,
        expected_version: 0,
        regenerate: false,
        idempotency_key: crypto.randomUUID(),
      },
    })
    expect(generateResult.error).toBeNull()

    const slotsResult = await client
      .from('plan_slots')
      .select('id,start_at,end_at,plan_options!plan_options_slot_id_fkey(id,title,start_at,end_at,kind,note_id)')
      .eq('plan_id', trip.plan_id)
      .is('deleted_at', null)
    expect(slotsResult.error).toBeNull()
    const slots = slotsResult.data ?? []
    const options = slots.flatMap((slot) => slot.plan_options ?? [])
    const activityOptions = options.filter((option) => option.kind === 'activity')
    const noteIds = new Set(notes.map((note) => note.id))
    expect(slots.length).toBeGreaterThan(0)
    expect(options.length).toBeGreaterThan(0)
    expect(activityOptions).toHaveLength(notes.length)
    expect(activityOptions.every((option) => Boolean(option.note_id && noteIds.has(option.note_id)))).toBe(true)
    for (const slot of slots) {
      expect(Date.parse(slot.start_at)).not.toBeNaN()
      expect(Date.parse(slot.end_at)).toBeGreaterThan(Date.parse(slot.start_at))
    }

    const runsResult = await client
      .from('ai_runs')
      .select('kind,status,error_code')
      .eq('trip_id', trip.trip_id)
      .order('created_at')
    expect(runsResult.error).toBeNull()
    expect(runsResult.data).toEqual([
      expect.objectContaining({ kind: 'extract_notes', status: 'completed', error_code: null }),
      expect.objectContaining({ kind: 'generate_plan', status: 'completed', error_code: null }),
    ])
  }, 120_000)

  openAIConfiguredIntegration('keeps every wish of a chat, including competing meals, as its own note', async () => {
    const client = createClient<Database>(url!, key!)
    const auth = await client.auth.signInAnonymously()
    expect(auth.error).toBeNull()
    const user = auth.data.user!

    const tripResult = await client.rpc('create_trip', {
      p_title: '希望の取りこぼしテスト',
      p_nickname: 'sora',
      p_starts_at: '2026-08-16T00:00:00Z',
      p_ends_at: '2026-08-17T00:00:00Z',
      p_timezone: 'Asia/Tokyo',
    })
    expect(tripResult.error).toBeNull()
    const trip = tripResult.data![0]

    const wishes = [
      '東京タワー行きたい',
      '神社行きたい',
      '東京スカイツリー行きたい',
      '楽しそう',
      'お昼ご飯にカレーを食べたい',
      'お昼に焼肉をしたい',
      'おーい',
      'GOGOカレーに行きたい',
    ]
    for (const text of wishes) {
      const inserted = await client
        .from('messages')
        .insert({ trip_id: trip.trip_id, author_id: user.id, author_name: 'sora', text })
      expect(inserted.error).toBeNull()
    }

    const extractResult = await client.functions.invoke('extract-notes', {
      body: { trip_id: trip.trip_id, idempotency_key: crypto.randomUUID() },
    })
    expect(extractResult.error).toBeNull()

    const notesResult = await client
      .from('notes')
      .select('title')
      .eq('trip_id', trip.trip_id)
      .is('deleted_at', null)
    expect(notesResult.error).toBeNull()
    const titles = (notesResult.data ?? []).map((note) => note.title)

    // 同じ時間帯を争う食事の希望も、まとめず1件ずつ付箋にする。
    for (const wish of ['東京タワー', '神社', 'スカイツリー', 'カレー', '焼肉', 'GOGOカレー']) {
      expect(titles.some((title) => title.includes(wish))).toBe(true)
    }
    expect(titles).toHaveLength(6)
  }, 120_000)

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

    const noteResult = await ownerClient
      .from('notes')
      .insert({
        trip_id: trip.trip_id,
        title: '美術館',
        memo: null,
        attrs: { time_hint: '午前' },
        origin: 'user',
        user_touched: true,
        author_id: owner.id,
      })
      .select()
      .single()
    expect(noteResult.error).toBeNull()

    const planResult = await ownerClient.rpc('apply_plan_command', {
      p_plan_id: trip.plan_id,
      p_expected_version: 0,
      p_command: {
        type: 'replace_plan',
        summary: '統合テスト用プラン',
        payload: {
          regenerate: false,
          slots: [
            {
              start_at: '2026-08-16T01:00:00Z',
              end_at: '2026-08-16T02:00:00Z',
              options: [
                {
                  note_id: noteResult.data!.id,
                  title: '美術館',
                  start_at: '2026-08-16T01:00:00Z',
                  end_at: '2026-08-16T02:00:00Z',
                  kind: 'activity',
                  attrs: { time_hint: '午前' },
                  reason: '統合テスト',
                },
              ],
            },
          ],
        },
      },
    })
    expect(planResult.error).toBeNull()

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
    expect(feedResult.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'plan', plan_id: trip.plan_id }),
        expect.objectContaining({ source: 'personal', title: '個人予定' }),
      ]),
    )

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
