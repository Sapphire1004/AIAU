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
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import timeGridPlugin from '@fullcalendar/timegrid'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  HardDrive,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/layout/states'
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

const CALENDAR_VIEWS = [
  { id: 'timeGridDay', label: '日' },
  { id: 'timeGridWeek', label: '週' },
  { id: 'dayGridMonth', label: '月' },
  { id: 'listMonth', label: 'アジェンダ' },
] as const

const FIELD_CLASS_NAME =
  'min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none transition-shadow focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60'

type CalendarViewName = (typeof CALENDAR_VIEWS)[number]['id']
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

function getDefaultView(): CalendarViewName {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 640px)').matches
  ) {
    return 'listMonth'
  }
  return 'timeGridDay'
}

function getInitialRange(view: CalendarViewName): VisibleRange {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)

  if (view === 'timeGridWeek') {
    const daysSinceMonday = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - daysSinceMonday)
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 7)
  } else if (view === 'dayGridMonth' || view === 'listMonth') {
    start.setDate(1)
    end.setTime(start.getTime())
    end.setMonth(end.getMonth() + 1)
  } else {
    end.setDate(end.getDate() + 1)
  }

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
  const isAgenda = content.view.type.startsWith('list')

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 px-0.5 py-0.5 text-xs leading-tight">
      <span className="rounded-sm border border-current/30 bg-background/75 px-1 py-0.5 font-semibold">
        {sourceLabel(source)}
      </span>
      {!isAgenda && content.timeText && <span className="font-medium">{content.timeText}</span>}
      <span className="min-w-0 font-semibold">{content.event.title}</span>
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
  const initialViewRef = useRef<CalendarViewName>(getDefaultView())
  const calendarRef = useRef<FullCalendar>(null)
  const refreshSequenceRef = useRef(0)
  const hasLoadedRef = useRef(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [timezone] = useState(getBrowserTimezone)
  const [visibleRange, setVisibleRange] = useState<VisibleRange>(() =>
    getInitialRange(initialViewRef.current),
  )
  const [activeView, setActiveView] = useState<CalendarViewName>(initialViewRef.current)
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
            backgroundColor: isPlan
              ? 'color-mix(in oklch, var(--destructive) 10%, var(--card))'
              : 'var(--secondary)',
            borderColor: isPlan ? 'var(--destructive)' : 'var(--foreground)',
            textColor: 'var(--foreground)',
            classNames: isSelected ? ['ring-2', 'ring-ring', 'ring-offset-1'] : [],
            extendedProps: {
              source: event.source,
              calendarEventId: event.id,
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
    const view = CALENDAR_VIEWS.find((item) => item.id === details.view.type)
    if (view) setActiveView(view.id)
    setVisibleRange((current) => {
      if (current.from === details.startStr && current.to === details.endStr) return current
      return { from: details.startStr, to: details.endStr }
    })
  }, [])

  function changeView(view: CalendarViewName) {
    calendarRef.current?.getApi().changeView(view)
    setActiveView(view)
  }

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

  if (loading) return <LoadingState label="カレンダーを読み込み中" />

  const selectedAddress = selectedEvent
    ? getStringAttribute(selectedEvent.attrs, 'address', 'location')
    : ''
  const selectedMemo = selectedEvent
    ? getStringAttribute(selectedEvent.attrs, 'memo', 'description')
    : ''
  const selectedCost = selectedEvent ? getStringAttribute(selectedEvent.attrs, 'cost') : ''

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-wide text-muted-foreground">SCREEN 03 · CALENDAR</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">カレンダー</h1>
          <p className="mt-2 text-muted-foreground">旅の予定も、いつもの予定も、ひとつの場所で。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedExportTarget && (
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              to={`/trips/${selectedExportTarget.trip.id}/plan`}
            >
              プランを見る
            </Link>
          )}
          <Button className="min-h-11 px-4" onClick={() => openCreateEditor()}>
            <Plus aria-hidden="true" />
            予定を追加
          </Button>
        </div>
      </header>

      {error && (
        <div className="space-y-2">
          <ErrorState message={error} />
          <Button className="min-h-11" variant="outline" onClick={() => void refreshCalendar()}>
            <RefreshCw aria-hidden="true" />
            再読み込み
          </Button>
        </div>
      )}

      {notice && (
        <div
          className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm"
          role="status"
        >
          <CheckCircle2 aria-hidden="true" className="size-5" />
          {notice}
        </div>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="予定カレンダー">
          <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between lg:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                aria-label="前の期間"
                className="min-h-11 min-w-11"
                size="icon"
                variant="outline"
                onClick={() => calendarRef.current?.getApi().prev()}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <p className="min-w-48 text-center text-sm font-bold sm:text-base" aria-live="polite">
                {calendarTitle}
              </p>
              <Button
                aria-label="次の期間"
                className="min-h-11 min-w-11"
                size="icon"
                variant="outline"
                onClick={() => calendarRef.current?.getApi().next()}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button
                className="min-h-11"
                variant="outline"
                onClick={() => calendarRef.current?.getApi().today()}
              >
                今日
              </Button>
              {refreshing && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  更新中
                </span>
              )}
            </div>
            <div
              className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1"
              role="group"
              aria-label="カレンダー表示"
            >
              {CALENDAR_VIEWS.map((view) => (
                <Button
                  aria-pressed={activeView === view.id}
                  className="min-h-11 px-3"
                  key={view.id}
                  variant={activeView === view.id ? 'default' : 'ghost'}
                  onClick={() => changeView(view.id)}
                >
                  {view.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-4 py-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-sm border border-destructive bg-destructive/15" />
              プラン予定
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-sm border border-foreground bg-secondary" />
              個人予定
            </span>
            <span className="ml-auto text-xs">タイムゾーン: {timezone}</span>
          </div>

          <div className="min-w-0 p-2 sm:p-4 [&_.fc]:text-sm [&_.fc-event]:cursor-pointer [&_.fc-event]:overflow-hidden [&_.fc-list-event]:min-h-11 [&_.fc-more-link]:font-semibold [&_.fc-scrollgrid]:border-border [&_.fc-theme-standard_td]:border-border [&_.fc-theme-standard_th]:border-border">
            <FullCalendar
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
              firstDay={1}
              headerToolbar={false}
              height="auto"
              initialView={initialViewRef.current}
              locale={jaLocale}
              noEventsContent={() => <p className="p-4 text-muted-foreground">この期間に予定はありません</p>}
              nowIndicator
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              scrollTime="08:00:00"
              slotEventOverlap={false}
              stickyHeaderDates
            />
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-4" aria-labelledby="event-detail-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold" id="event-detail-heading">予定の詳細</h2>
              <span className="text-xs text-muted-foreground">選択すると表示</span>
            </div>

            {selectedEvent ? (
              <div className="mt-4">
                <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-xs font-semibold">
                  <CalendarDays aria-hidden="true" className="size-3.5" />
                  {sourceLabel(selectedEvent.source)}
                </span>
                <h3 className="mt-3 text-lg font-bold">{selectedEvent.title}</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="font-semibold text-muted-foreground">日時</dt>
                    <dd className="mt-1 leading-6">{formatEventPeriod(selectedEvent)}</dd>
                  </div>
                  {selectedAddress && (
                    <div>
                      <dt className="font-semibold text-muted-foreground">場所</dt>
                      <dd className="mt-1 flex gap-1.5 leading-6">
                        <MapPin aria-hidden="true" className="mt-1 size-4 shrink-0" />
                        {selectedAddress}
                      </dd>
                    </div>
                  )}
                  {selectedMemo && (
                    <div>
                      <dt className="font-semibold text-muted-foreground">メモ</dt>
                      <dd className="mt-1 whitespace-pre-wrap leading-6">{selectedMemo}</dd>
                    </div>
                  )}
                  {selectedCost && (
                    <div>
                      <dt className="font-semibold text-muted-foreground">費用</dt>
                      <dd className="mt-1">{selectedCost}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 grid gap-2 border-t pt-4">
                  {selectedEvent.source === 'personal' && (
                    <Button
                      className="min-h-11 w-full"
                      variant="outline"
                      onClick={() => openEditEditor(selectedEvent)}
                    >
                      <Pencil aria-hidden="true" />
                      個人予定を編集
                    </Button>
                  )}
                  {selectedEventTarget && (
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      to={`/trips/${selectedEventTarget.trip.id}/plan`}
                    >
                      プランを開く
                    </Link>
                  )}
                  {selectedEvent.noteId && selectedEventTarget && (
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      to={`/trips/${selectedEventTarget.trip.id}/ideas#${selectedEvent.noteId}`}
                    >
                      元の付箋を見る
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed p-6 text-center text-sm leading-6 text-muted-foreground">
                カレンダーの予定を選ぶと、日時・場所・メモなどを確認できます。
              </p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4" aria-labelledby="ics-heading">
            <div className="flex items-center gap-2">
              <Download aria-hidden="true" className="size-5" />
              <h2 className="font-semibold" id="ics-heading">ICS export</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              旅行に紐づく確定プランを、カレンダーファイルとして書き出します。
            </p>

            {exportTargetsLoading ? (
              <p className="mt-4 flex min-h-11 items-center gap-2 text-sm text-muted-foreground" role="status">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                旅行とプランを読み込み中
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="grid gap-1.5 text-sm font-medium" htmlFor="ics-plan">
                  旅行 / プランを選択
                  <select
                    className={FIELD_CLASS_NAME}
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
                <Button
                  className="min-h-11 w-full"
                  disabled={!selectedExportTarget || exporting}
                  onClick={() => void handleExportIcs()}
                >
                  {exporting ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Download aria-hidden="true" />
                  )}
                  {exporting ? '書き出し中' : 'ICSを書き出す'}
                </Button>
              </div>
            )}

            {exportError && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
                {exportError}
              </p>
            )}
          </section>
        </aside>
      </div>

      <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="offline-conflicts-heading">
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
