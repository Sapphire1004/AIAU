import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import FullCalendar from '@fullcalendar/react'
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventInput,
} from '@fullcalendar/core'
import jaLocale from '@fullcalendar/core/locales/ja'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import timeGridPlugin from '@fullcalendar/timegrid'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Download,
  HardDrive,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { LoadingState } from '@/components/layout/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getCalendarFeed,
  listOfflineConflicts,
  resolveOfflineConflict,
  savePersonalEvent,
  subscribeToCalendar,
  type PersonalEventDraft,
} from '@/repositories/calendar.repository'
import { subscribeToPlan } from '@/repositories/plans.repository'
import { exportPlanIcs } from '@/repositories/sharing.repository'
import { getPlanForTrip, listTrips } from '@/repositories/trips.repository'
import type { Json } from '@/types/database'
import type { CalendarEvent, OfflineConflict, Plan, Trip } from '@/types/domain'

const FIELD_CLASS_NAME =
  'min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-shadow focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60'

type JsonObject = { [key: string]: Json | undefined }

type VisibleRange = {
  from: string
  to: string
}

type ExportTarget = {
  trip: Trip
  plan: Plan
}

type EventEditor = {
  eventId?: string
  expectedRevision?: number
  originalAttrs: JsonObject
  title: string
  start: string
  end: string
  allDay: boolean
  address: string
  memo: string
}

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const MAX_TRIP_DAYS = 7

type TripRange = {
  start: Date
  days: number
}

/** 旅行開始日から最大 7 日間の表示範囲を求める。
 * 2 日間の旅行なら 2 日だけ表示し、終了日がなければ 7 日、開始日がなければ今日を起点にする */
function getTripRange(trip: Trip | null | undefined): TripRange {
  const fallback = new Date()
  fallback.setHours(0, 0, 0, 0)
  if (!trip?.starts_at) return { start: fallback, days: MAX_TRIP_DAYS }

  const start = new Date(trip.starts_at)
  if (Number.isNaN(start.getTime())) return { start: fallback, days: MAX_TRIP_DAYS }
  start.setHours(0, 0, 0, 0)

  if (!trip.ends_at) return { start, days: MAX_TRIP_DAYS }
  const end = new Date(trip.ends_at)
  if (Number.isNaN(end.getTime())) return { start, days: MAX_TRIP_DAYS }
  end.setHours(0, 0, 0, 0)

  const inclusiveDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  return { start, days: Math.min(Math.max(inclusiveDays, 1), MAX_TRIP_DAYS) }
}

function getInitialRange(): VisibleRange {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + MAX_TRIP_DAYS)
  return { from: start.toISOString(), to: end.toISOString() }
}

function getBrowserTimezone(): string {
  if (typeof Intl === 'undefined') return 'UTC'
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function asJsonObject(value: Json): JsonObject {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value
  return {}
}

function getStringAttribute(value: Json, ...keys: string[]): string {
  const object = asJsonObject(value)
  for (const key of keys) {
    const item = object[key]
    if (typeof item === 'string' && item.trim()) return item
    if (typeof item === 'number') return String(item)
  }
  return ''
}

function toLocalDateTimeValue(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function createNewEditor(startValue = new Date(), allDay = false): EventEditor {
  const start = new Date(startValue)
  start.setSeconds(0, 0)
  if (allDay) {
    start.setHours(0, 0, 0, 0)
  } else {
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30)
  }
  const end = new Date(start)
  if (allDay) end.setDate(end.getDate() + 1)
  else end.setHours(end.getHours() + 1)

  return {
    originalAttrs: {},
    title: '',
    start: toLocalDateTimeValue(start),
    end: toLocalDateTimeValue(end),
    allDay,
    address: '',
    memo: '',
  }
}

function createEditEditor(event: CalendarEvent): EventEditor {
  return {
    eventId: event.id,
    expectedRevision: event.revision,
    originalAttrs: { ...asJsonObject(event.attrs) },
    title: event.title,
    start: toLocalDateTimeValue(event.startAt),
    end: toLocalDateTimeValue(event.endAt),
    allDay: event.allDay,
    address: getStringAttribute(event.attrs, 'address', 'location'),
    memo: getStringAttribute(event.attrs, 'memo', 'description'),
  }
}

function eventKey(event: Pick<CalendarEvent, 'id' | 'source'>): string {
  return `${event.source}:${event.id}`
}

function sourceLabel(source: CalendarEvent['source']): string {
  return source === 'plan' ? 'プラン予定' : '個人予定'
}

function formatEventPeriod(event: CalendarEvent): string {
  const start = new Date(event.startAt)
  const end = new Date(event.endAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '日時情報なし'

  if (event.allDay) {
    const inclusiveEnd = new Date(end.getTime() - 1)
    const sameDay = start.toDateString() === inclusiveEnd.toDateString()
    return sameDay
      ? `${dateFormatter.format(start)}（終日）`
      : `${dateFormatter.format(start)} 〜 ${dateFormatter.format(inclusiveEnd)}（終日）`
  }

  return `${dateTimeFormatter.format(start)} 〜 ${dateTimeFormatter.format(end)}`
}

function formatOptionalDateTime(value: unknown): string {
  if (typeof value !== 'string') return '日時情報なし'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日時情報なし'
  return dateTimeFormatter.format(date)
}

function renderCalendarEvent(content: EventContentArg) {
  const source = content.event.extendedProps.source === 'plan' ? 'plan' : 'personal'
  const location = typeof content.event.extendedProps.location === 'string' ? content.event.extendedProps.location : ''
  const isAgenda = content.view.type.startsWith('list')

  if (isAgenda) {
    return (
      <div className="calendar-agenda-content">
        <strong>{content.event.title}</strong>
        {location && <small>{location}</small>}
        <span className={`agenda-badge ${source === 'plan' ? 'plan' : 'personal'}`}>{sourceLabel(source)}</span>
      </div>
    )
  }

  return (
    <div className="calendar-event-content">
      <span className="event-type">{sourceLabel(source)}</span>
      <strong>{content.event.title}</strong>
      <small>{[content.timeText, location].filter(Boolean).join('　')}</small>
    </div>
  )
}

function ConflictSnapshot({ label, value }: { label: string; value: Json }) {
  const state = asJsonObject(value)
  const title = typeof state.title === 'string' ? state.title : 'タイトル情報なし'

  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{title}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {formatOptionalDateTime(state.start_at)}
        <br />〜 {formatOptionalDateTime(state.end_at)}
      </p>
    </div>
  )
}

export function CalendarPage({ userId }: { userId: string }) {
  const calendarRef = useRef<FullCalendar>(null)
  const refreshSequenceRef = useRef(0)
  const hasLoadedRef = useRef(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [timezone] = useState(getBrowserTimezone)
  const [visibleRange, setVisibleRange] = useState<VisibleRange>(getInitialRange)
  const [calendarTitle, setCalendarTitle] = useState(() => dateFormatter.format(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [conflicts, setConflicts] = useState<OfflineConflict[]>([])
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editor, setEditor] = useState<EventEditor | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [exportTargets, setExportTargets] = useState<ExportTarget[]>([])
  const [exportTargetsLoading, setExportTargetsLoading] = useState(true)
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const queryTripId = searchParams.get('tripId')
  const selectedEvent = useMemo(
    () => events.find((event) => eventKey(event) === selectedEventKey) ?? null,
    [events, selectedEventKey],
  )
  const selectedExportTarget = useMemo(
    () => exportTargets.find((target) => target.plan.id === selectedPlanId) ?? null,
    [exportTargets, selectedPlanId],
  )
  const selectedEventTarget = useMemo(
    () =>
      selectedEvent?.planId
        ? exportTargets.find((target) => target.plan.id === selectedEvent.planId) ?? null
        : null,
    [exportTargets, selectedEvent],
  )
  const tripRange = useMemo(() => getTripRange(selectedExportTarget?.trip), [selectedExportTarget])

  const fullCalendarEvents = useMemo<EventInput[]>(
    () =>
      events
        .filter((event) => event.source === 'plan' || event.source === 'personal')
        .map((event) => {
          const isPlan = event.source === 'plan'
          const isSelected = eventKey(event) === selectedEventKey
          return {
            id: eventKey(event),
            title: event.title,
            start: event.startAt,
            end: event.endAt,
            allDay: event.allDay,
            backgroundColor: isPlan ? '#fff2ef' : '#eff5fc',
            borderColor: isPlan ? '#e87561' : '#4e82c4',
            textColor: '#263238',
            classNames: [
              'aiau-calendar-event',
              isPlan ? 'aiau-plan-event' : 'aiau-personal-event',
              ...(isSelected ? ['is-selected'] : []),
            ],
            extendedProps: {
              source: event.source,
              calendarEventId: event.id,
              location: getStringAttribute(event.attrs, 'address', 'location'),
            },
          }
        }),
    [events, selectedEventKey],
  )

  const refreshCalendar = useCallback(async () => {
    const requestId = ++refreshSequenceRef.current
    if (hasLoadedRef.current) setRefreshing(true)
    else setLoading(true)

    try {
      const [feed, pendingConflicts] = await Promise.all([
        getCalendarFeed(visibleRange.from, visibleRange.to, timezone),
        listOfflineConflicts(),
      ])
      if (requestId !== refreshSequenceRef.current) return
      setEvents(feed.filter((event) => event.source === 'plan' || event.source === 'personal'))
      setConflicts(pendingConflicts)
      setError(null)
      hasLoadedRef.current = true
    } catch (reason) {
      if (requestId !== refreshSequenceRef.current) return
      setError(reason instanceof Error ? reason.message : 'カレンダーを読み込めませんでした')
    } finally {
      if (requestId === refreshSequenceRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [timezone, visibleRange.from, visibleRange.to])

  useEffect(() => {
    void refreshCalendar()
    return () => {
      refreshSequenceRef.current += 1
    }
  }, [refreshCalendar])

  useEffect(() => {
    const channel = subscribeToCalendar(userId, () => void refreshCalendar())
    return () => {
      void channel.unsubscribe()
    }
  }, [refreshCalendar, userId])

  useEffect(() => {
    let active = true

    async function loadExportTargets() {
      setExportTargetsLoading(true)
      try {
        const trips = await listTrips()
        const targets = await Promise.all(
          trips.map(async (trip) => ({ trip, plan: await getPlanForTrip(trip.id) })),
        )
        if (!active) return
        setExportTargets(targets)
        setExportError(null)
      } catch (reason) {
        if (!active) return
        setExportError(reason instanceof Error ? reason.message : '旅行とプランを読み込めませんでした')
      } finally {
        if (active) setExportTargetsLoading(false)
      }
    }

    void loadExportTargets()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (exportTargets.length === 0) {
      setSelectedPlanId('')
      return
    }

    const queryTarget = exportTargets.find((target) => target.trip.id === queryTripId)
    setSelectedPlanId((current) => {
      if (queryTarget) return queryTarget.plan.id
      if (exportTargets.some((target) => target.plan.id === current)) return current
      return exportTargets[0].plan.id
    })
  }, [exportTargets, queryTripId])

  useEffect(() => {
    if (!selectedExportTarget) return
    const channel = subscribeToPlan(selectedExportTarget.plan.id, () => void refreshCalendar())
    return () => {
      void channel.unsubscribe()
    }
  }, [refreshCalendar, selectedExportTarget])

  const handleDatesSet = useCallback((details: DatesSetArg) => {
    setCalendarTitle(details.view.title)
    setVisibleRange((current) => {
      if (current.from === details.startStr && current.to === details.endStr) return current
      return { from: details.startStr, to: details.endStr }
    })
  }, [])

  function handleEventClick(details: EventClickArg) {
    const source = details.event.extendedProps.source === 'plan' ? 'plan' : 'personal'
    const calendarEventId = details.event.extendedProps.calendarEventId
    if (typeof calendarEventId !== 'string') return
    setSelectedEventKey(`${source}:${calendarEventId}`)
  }

  function openCreateEditor(start?: Date, allDay = false) {
    setEditorError(null)
    setEditor(createNewEditor(start, allDay))
  }

  function handleDateClick(details: DateClickArg) {
    openCreateEditor(details.date, details.allDay)
  }

  function openEditEditor(event: CalendarEvent) {
    if (event.source !== 'personal') return
    setEditorError(null)
    setEditor(createEditEditor(event))
  }

  function updateEditor(patch: Partial<EventEditor>) {
    setEditor((current) => (current ? { ...current, ...patch } : current))
  }

  function updateAllDay(allDay: boolean) {
    setEditor((current) => {
      if (!current || current.allDay === allDay) return current
      const start = new Date(current.start)
      if (Number.isNaN(start.getTime())) return { ...current, allDay }

      if (allDay) {
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 1)
        return {
          ...current,
          allDay,
          start: toLocalDateTimeValue(start),
          end: toLocalDateTimeValue(end),
        }
      }

      start.setHours(9, 0, 0, 0)
      const end = new Date(start)
      end.setHours(end.getHours() + 1)
      return {
        ...current,
        allDay,
        start: toLocalDateTimeValue(start),
        end: toLocalDateTimeValue(end),
      }
    })
  }

  async function handleSavePersonalEvent(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault()
    if (!editor) return

    const title = editor.title.trim()
    const start = new Date(editor.start)
    const end = new Date(editor.end)
    if (!title) {
      setEditorError('タイトルを入力してください')
      return
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setEditorError('開始日時と終了日時を入力してください')
      return
    }
    if (end <= start) {
      setEditorError('終了日時は開始日時より後にしてください')
      return
    }

    const attrs = { ...editor.originalAttrs }
    delete attrs.address
    delete attrs.location
    delete attrs.memo
    delete attrs.description
    if (editor.address.trim()) attrs.address = editor.address.trim()
    if (editor.memo.trim()) attrs.memo = editor.memo.trim()

    const draft: PersonalEventDraft = {
      title,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: editor.allDay,
      attrs,
    }
    if (editor.eventId) draft.id = editor.eventId

    setSaving(true)
    setEditorError(null)
    setError(null)
    setNotice(null)
    try {
      const result = editor.eventId
        ? await savePersonalEvent(draft, editor.expectedRevision)
        : await savePersonalEvent(draft)
      setEditor(null)
      await refreshCalendar()
      if (result.status === 'conflict') {
        setError('同じ個人予定が別の場所で更新されています。下の競合一覧から採用する版を選んでください。')
      } else {
        setNotice(editor.eventId ? '個人予定を更新しました' : '個人予定を追加しました')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '個人予定を保存できませんでした')
    } finally {
      setSaving(false)
    }
  }

  async function handleResolveConflict(
    conflictId: string,
    resolution: 'local' | 'server',
  ) {
    const actionId = `${conflictId}:${resolution}`
    setResolving(actionId)
    setError(null)
    setNotice(null)
    try {
      await resolveOfflineConflict(conflictId, resolution)
      await refreshCalendar()
      setNotice(
        resolution === 'local'
          ? 'ローカル版を採用して競合を解決しました'
          : 'サーバー版を採用して競合を解決しました',
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '競合を解決できませんでした')
    } finally {
      setResolving(null)
    }
  }

  function handleExportTargetChange(planId: string) {
    setSelectedPlanId(planId)
    const target = exportTargets.find((item) => item.plan.id === planId)
    if (!target) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tripId', target.trip.id)
    setSearchParams(nextParams, { replace: true })
  }

  async function handleExportIcs() {
    if (!selectedExportTarget) return
    setExporting(true)
    setExportError(null)
    setNotice(null)
    try {
      const blob = await exportPlanIcs(selectedExportTarget.plan.id)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `aiau-${selectedExportTarget.trip.id}.ics`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
      setNotice(`「${selectedExportTarget.trip.title}」のプランをICSで書き出しました`)
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : 'ICSを書き出せませんでした')
    } finally {
      setExporting(false)
    }
  }

  if (loading || exportTargetsLoading) return <LoadingState label="カレンダーを読み込み中" />

  const selectedAddress = selectedEvent
    ? getStringAttribute(selectedEvent.attrs, 'address', 'location')
    : ''
  const selectedMemo = selectedEvent
    ? getStringAttribute(selectedEvent.attrs, 'memo', 'description')
    : ''
  const selectedCost = selectedEvent ? getStringAttribute(selectedEvent.attrs, 'cost') : ''

  return (
    <div className="calendar-page page-shell">
      <header className="page-title">
        <div>
          <span className="eyebrow">SCREEN 03 · CALENDAR</span>
          <h1>カレンダー</h1>
          <p>旅の予定も、いつもの予定も、ひとつの場所で。</p>
        </div>
        <div className="title-actions">
          {selectedExportTarget && (
            <Link className="secondary-button" to={`/trips/${selectedExportTarget.trip.id}/plan`}>
              ← プランを見る
            </Link>
          )}
          <button className="primary-button" onClick={() => openCreateEditor()} type="button">
            ＋ 予定を追加
          </button>
        </div>
      </header>

      {error && (
        <div className="calendar-feedback" role="alert">
          <span>{error}</span>
          <button className="secondary-button" onClick={() => void refreshCalendar()} type="button">
            <RefreshCw aria-hidden="true" />
            再読み込み
          </button>
        </div>
      )}

      {notice && (
        <div className="calendar-feedback success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      <div className="calendar-grid">
        <section aria-label="予定カレンダー" className="surface-card calendar-main">
          <div className="calendar-toolbar">
            <div className="calendar-date">
              <span aria-live="polite">{calendarTitle}</span>
              <span className="calendar-trip-days">
                {selectedExportTarget
                  ? `「${selectedExportTarget.trip.title}」の旅程（${tripRange.days}日間）`
                  : `旅行期間（最大${MAX_TRIP_DAYS}日間）`}
              </span>
              {refreshing && (
                <span className="calendar-refreshing" role="status">
                  <LoaderCircle aria-hidden="true" />更新中
                </span>
              )}
            </div>
          </div>

          <div className="legend">
            <span className="legend-item"><i aria-hidden="true" className="legend-color coral" />プラン予定</span>
            <span className="legend-item"><i aria-hidden="true" className="legend-color blue" />個人予定</span>
            <span className="calendar-timezone">タイムゾーン: {timezone}</span>
          </div>

          <div className="calendar-fullcalendar calendar-view">
            <FullCalendar
              key={`${selectedExportTarget?.trip.id ?? 'no-trip'}:${tripRange.days}:${tripRange.start.toISOString()}`}
              ref={calendarRef}
              allDayText="終日"
              dayMaxEvents
              dateClick={handleDateClick}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              eventContent={renderCalendarEvent}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              events={fullCalendarEvents}
              expandRows
              headerToolbar={false}
              height="auto"
              initialDate={tripRange.start}
              initialView="tripGrid"
              locale={jaLocale}
              nowIndicator
              plugins={[timeGridPlugin, interactionPlugin]}
              scrollTime="08:00:00"
              slotEventOverlap={false}
              stickyHeaderDates
              views={{ tripGrid: { type: 'timeGrid', duration: { days: tripRange.days } } }}
            />
          </div>
        </section>

        <aside className="surface-card calendar-side">
          <div className="side-heading">
            <h2 id="event-detail-heading">予定の詳細</h2>
            <span>選択すると表示</span>
          </div>

          {selectedEvent ? (
            <div aria-labelledby="event-detail-heading" className="event-detail">
              <span className="detail-label">{sourceLabel(selectedEvent.source)}</span>
              <h3>{selectedEvent.title}</h3>
              <dl className="detail-list">
                <div><dt>日時</dt><dd>{formatEventPeriod(selectedEvent)}</dd></div>
                <div><dt>場所</dt><dd>{selectedAddress || '場所の指定なし'}</dd></div>
                <div><dt>メモ</dt><dd className="detail-memo">{selectedMemo || 'メモはありません。'}</dd></div>
                {selectedCost && <div><dt>費用</dt><dd>{selectedCost}</dd></div>}
              </dl>
              <div className="detail-links">
                {selectedEvent.source === 'personal' && (
                  <button className="text-button" onClick={() => openEditEditor(selectedEvent)} type="button">
                    個人予定を編集 →
                  </button>
                )}
                {selectedEvent.noteId && selectedEventTarget && (
                  <Link to={`/trips/${selectedEventTarget.trip.id}/ideas#${selectedEvent.noteId}`}>元の付箋を見る ↗</Link>
                )}
                {selectedEventTarget && (
                  <Link to={`/trips/${selectedEventTarget.trip.id}/plan`}>プランを開く ↗</Link>
                )}
              </div>
            </div>
          ) : (
            <div aria-labelledby="event-detail-heading" className="empty-detail">
              カレンダーの予定を選ぶと、<br />日時・場所・メモなどを<br />ここで確認できます。
            </div>
          )}

          <section aria-labelledby="ics-heading" className="sync-card">
            <strong id="ics-heading">カレンダーへの書き出し</strong>
            <p>旅行に紐づく確定プランを、ICSカレンダーファイルとして書き出します。</p>

            {exportTargetsLoading ? (
              <p className="calendar-export-status" role="status">
                <LoaderCircle aria-hidden="true" />旅行とプランを読み込み中
              </p>
            ) : (
              <div className="calendar-export-controls">
                <label className="form-field" htmlFor="ics-plan">
                  旅行 / プランを選択
                  <select
                    className="calendar-select"
                    disabled={exportTargets.length === 0 || exporting}
                    id="ics-plan"
                    value={selectedPlanId}
                    onChange={(event) => handleExportTargetChange(event.target.value)}
                  >
                    {exportTargets.length === 0 && <option value="">書き出せるプランがありません</option>}
                    {exportTargets.map((target) => (
                      <option key={target.plan.id} value={target.plan.id}>
                        {target.trip.title} / プラン
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="calendar-export-button primary-button"
                  disabled={!selectedExportTarget || exporting}
                  onClick={() => void handleExportIcs()}
                  type="button"
                >
                  {exporting ? <LoaderCircle aria-hidden="true" /> : <Download aria-hidden="true" />}
                  {exporting ? '書き出し中' : 'ICSを書き出す'}
                </button>
              </div>
            )}

            {exportError && <p className="calendar-export-error" role="alert">{exportError}</p>}
          </section>
        </aside>
      </div>

      <section className="offline-conflicts surface-card" aria-labelledby="offline-conflicts-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="size-5" />
            <h2 className="font-semibold" id="offline-conflicts-heading">オフライン競合</h2>
          </div>
          <span className="rounded-full border bg-muted px-2.5 py-1 text-xs font-semibold">
            保留中 {conflicts.length}件
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          オフライン編集とサーバー上の更新が重なった場合、残す内容を選んで解決します。
        </p>

        {conflicts.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            保留中の競合はありません。
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            {conflicts.map((conflict) => {
              const localActionId = `${conflict.id}:local`
              const serverActionId = `${conflict.id}:server`
              const isResolving = resolving?.startsWith(conflict.id) ?? false
              return (
                <article className="rounded-lg border bg-muted/20 p-4" key={conflict.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">個人予定の編集競合</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dateTimeFormatter.format(new Date(conflict.created_at))} · ローカル版 v{conflict.base_revision} / サーバー版 v{conflict.server_revision}
                      </p>
                    </div>
                    <span className="rounded-md border bg-background px-2 py-1 text-xs">要選択</span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <ConflictSnapshot label="ローカル版" value={conflict.local_state} />
                    <ConflictSnapshot label="サーバー版" value={conflict.server_state} />
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button
                      className="min-h-11"
                      disabled={isResolving}
                      onClick={() => void handleResolveConflict(conflict.id, 'local')}
                    >
                      {resolving === localActionId ? (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      ) : (
                        <HardDrive aria-hidden="true" />
                      )}
                      ローカル版を採用
                    </Button>
                    <Button
                      className="min-h-11"
                      disabled={isResolving}
                      variant="outline"
                      onClick={() => void handleResolveConflict(conflict.id, 'server')}
                    >
                      {resolving === serverActionId ? (
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                      ) : (
                        <Cloud aria-hidden="true" />
                      )}
                      サーバー版を採用
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditor(null)
            setEditorError(null)
          }
        }}
      >
        {editor && (
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editor.eventId ? '個人予定を編集' : '個人予定を追加'}</DialogTitle>
              <DialogDescription>
                この予定は自分のカレンダーにだけ保存されます。プラン予定はプラン画面から編集してください。
              </DialogDescription>
            </DialogHeader>

            <form className="grid gap-4" onSubmit={(event) => void handleSavePersonalEvent(event)}>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor="personal-title">
                タイトル
                <input
                  required
                  className={FIELD_CLASS_NAME}
                  disabled={saving}
                  id="personal-title"
                  maxLength={200}
                  value={editor.title}
                  onChange={(event) => updateEditor({ title: event.target.value })}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium" htmlFor="personal-start">
                  開始
                  <input
                    required
                    className={FIELD_CLASS_NAME}
                    disabled={saving}
                    id="personal-start"
                    type="datetime-local"
                    value={editor.start}
                    onChange={(event) => updateEditor({ start: event.target.value })}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium" htmlFor="personal-end">
                  終了
                  <input
                    required
                    className={FIELD_CLASS_NAME}
                    disabled={saving}
                    id="personal-end"
                    type="datetime-local"
                    value={editor.end}
                    onChange={(event) => updateEditor({ end: event.target.value })}
                  />
                </label>
              </div>

              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-medium">
                <input
                  checked={editor.allDay}
                  className="size-5"
                  disabled={saving}
                  type="checkbox"
                  onChange={(event) => updateAllDay(event.target.checked)}
                />
                終日予定
              </label>
              {editor.allDay && (
                <p className="-mt-2 text-xs leading-5 text-muted-foreground">
                  終了には予定最終日の翌日 00:00 を指定してください。
                </p>
              )}

              <label className="grid gap-1.5 text-sm font-medium" htmlFor="personal-address">
                場所（任意）
                <input
                  className={FIELD_CLASS_NAME}
                  disabled={saving}
                  id="personal-address"
                  maxLength={300}
                  value={editor.address}
                  onChange={(event) => updateEditor({ address: event.target.value })}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium" htmlFor="personal-memo">
                メモ（任意）
                <textarea
                  className={`${FIELD_CLASS_NAME} min-h-24 resize-y`}
                  disabled={saving}
                  id="personal-memo"
                  maxLength={2000}
                  value={editor.memo}
                  onChange={(event) => updateEditor({ memo: event.target.value })}
                />
              </label>

              {editorError && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
                  {editorError}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  className="min-h-11"
                  disabled={saving}
                  type="button"
                  variant="outline"
                  onClick={() => setEditor(null)}
                >
                  キャンセル
                </Button>
                <Button className="min-h-11" disabled={saving} type="submit">
                  {saving ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : editor.eventId ? (
                    <Pencil aria-hidden="true" />
                  ) : (
                    <Plus aria-hidden="true" />
                  )}
                  {saving ? '保存中' : editor.eventId ? '変更を保存' : '予定を追加'}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
