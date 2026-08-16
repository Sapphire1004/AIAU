import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Check, Eye, History, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/layout/states'
import { Button } from '@/components/ui/button'
import {
  buildTimeline,
  supersededSlotIds,
  timestamp,
  type RejectedOption,
  type SlotEntry,
  type TimelineGroup,
} from '@/lib/plan-timeline'
import {
  castVote,
  confirmOption,
  getPlanState,
  listPlanVersions,
  restorePlanVersion,
  retractVotes,
  subscribeToPlan,
  type PlanState,
} from '@/repositories/plans.repository'
import { getPlanForTrip, getTrip } from '@/repositories/trips.repository'
import { generatePlan } from '@/services/ai.service'
import type { PlanOption, PlanSlot, PlanSnapshot, PlanVersion, Trip, Vote } from '@/types/domain'

const EMPTY_SLOTS: PlanSlot[] = []
const EMPTY_OPTIONS: PlanOption[] = []
const EMPTY_VOTES: Vote[] = []
const COLUMNS_PER_HOUR = 4
const GROUP_ACCENTS = ['#7c5cbf', '#c2669a', '#4f86c6', '#c78a3c']

export function PlanPage({ userId }: { userId: string }) {
  const { tripId = '' } = useParams()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [planState, setPlanState] = useState<PlanState | null>(null)
  const [versions, setVersions] = useState<PlanVersion[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [previewVersionNumber, setPreviewVersionNumber] = useState<number | null>(null)
  const [restoreTargetVersion, setRestoreTargetVersion] = useState<number | null>(null)
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null)
  const historyPanelRef = useRef<HTMLElement | null>(null)

  const refreshPlan = useCallback(async (id: string, fromRealtime = false) => {
    setRefreshing(true)
    try {
      const [nextState, nextVersions] = await Promise.all([getPlanState(id), listPlanVersions(id)])
      setPlanState(nextState)
      setVersions(nextVersions)
      setError(null)
      if (fromRealtime) setNotice('共同編集の最新内容を反映しました')
    } catch (reason) {
      setError(toErrorMessage(reason, 'プランを再取得できませんでした'))
    } finally {
      setRefreshing(false)
    }
  }, [])

  const loadInitial = useCallback(async () => {
    setInitialLoading(true)
    setTrip(null)
    setPlanId(null)
    setPlanState(null)
    setVersions([])
    setPreviewVersionNumber(null)
    setRestoreTargetVersion(null)
    setActiveDateKey(null)
    setError(null)
    setNotice(null)

    try {
      if (!tripId) throw new Error('旅行IDが指定されていません')
      const [tripData, plan] = await Promise.all([getTrip(tripId), getPlanForTrip(tripId)])
      const [nextState, nextVersions] = await Promise.all([getPlanState(plan.id), listPlanVersions(plan.id)])
      setTrip(tripData)
      setPlanId(plan.id)
      setPlanState(nextState)
      setVersions(nextVersions)
    } catch (reason) {
      setError(toErrorMessage(reason, '旅行のプランを読み込めませんでした'))
    } finally {
      setInitialLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    if (!planId) return

    try {
      const channel = subscribeToPlan(planId, () => void refreshPlan(planId, true))
      return () => {
        void channel.unsubscribe()
      }
    } catch (reason) {
      setError(toErrorMessage(reason, 'リアルタイム同期を開始できませんでした'))
    }
  }, [planId, refreshPlan])

  useEffect(() => {
    if (!historyOpen) return
    historyPanelRef.current?.focus()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHistoryOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [historyOpen])

  const selectedPreviewVersion = useMemo(
    () => versions.find((version) => version.version === previewVersionNumber) ?? null,
    [previewVersionNumber, versions],
  )
  const previewSnapshot = useMemo(
    () => (selectedPreviewVersion ? parsePlanSnapshot(selectedPreviewVersion.snapshot) : null),
    [selectedPreviewVersion],
  )
  const isPreviewing = selectedPreviewVersion !== null && previewSnapshot !== null
  const displaySlots = previewSnapshot?.slots ?? planState?.slots ?? EMPTY_SLOTS
  const displayOptions = previewSnapshot?.options ?? planState?.options ?? EMPTY_OPTIONS
  const displayVotes = isPreviewing ? EMPTY_VOTES : planState?.votes ?? EMPTY_VOTES
  const timeZone = trip?.timezone ?? 'Asia/Tokyo'
  const slotGroups = useMemo(() => groupSlotsByDate(displaySlots, timeZone), [displaySlots, timeZone])
  const optionsBySlot = useMemo(() => {
    const grouped = new Map<string, PlanOption[]>()
    for (const option of displayOptions) {
      const options = grouped.get(option.slot_id) ?? []
      options.push(option)
      grouped.set(option.slot_id, options)
    }
    for (const options of grouped.values()) {
      options.sort((left, right) => timestamp(left.start_at) - timestamp(right.start_at))
    }
    return grouped
  }, [displayOptions])

  useEffect(() => {
    if (slotGroups.length === 0) {
      if (activeDateKey !== null) setActiveDateKey(null)
      return
    }
    if (!activeDateKey || !slotGroups.some((group) => group.key === activeDateKey)) {
      setActiveDateKey(slotGroups[0].key)
    }
  }, [activeDateKey, slotGroups])

  const resolvedDateIndex = slotGroups.findIndex((group) => group.key === activeDateKey)
  const activeDateIndex = resolvedDateIndex >= 0 ? resolvedDateIndex : 0
  const activeSlotGroup = slotGroups[activeDateIndex]
  const activeOptions = activeSlotGroup
    ? activeSlotGroup.slots.flatMap((slot) => optionsBySlot.get(slot.id) ?? EMPTY_OPTIONS)
    : EMPTY_OPTIONS
  const timelineScale = createTimelineScale(activeSlotGroup?.slots ?? EMPTY_SLOTS, activeOptions, timeZone)
  const isRegeneration = Boolean(planState && (planState.plan.current_version > 0 || planState.slots.length > 0))

  async function performAction(
    key: string,
    task: () => Promise<unknown>,
    successMessage: string,
    failureMessage: string,
  ) {
    if (!planState || actionKey) return
    const currentPlanId = planState.plan.id
    setActionKey(key)
    setError(null)
    setNotice(null)
    try {
      await task()
      await refreshPlan(currentPlanId)
      setNotice(successMessage)
    } catch (reason) {
      setError(toErrorMessage(reason, failureMessage))
    } finally {
      setActionKey(null)
    }
  }

  async function handleGenerate() {
    if (!planState || !tripId || isPreviewing) return
    const regenerate = planState.plan.current_version > 0 || planState.slots.length > 0
    await performAction(
      'generate',
      () => generatePlan(tripId, planState.plan.id, planState.plan.current_version, regenerate),
      regenerate ? 'AIでプランを再生成しました' : 'AIでプランを生成しました',
      regenerate ? 'AIによるプラン再生成に失敗しました' : 'AIによるプラン生成に失敗しました',
    )
  }

  async function handleVote(slotId: string, optionId: string, supersededSlotIds: string[]) {
    await performAction(
      `vote:${optionId}`,
      async () => {
        await castVote(slotId, optionId)
        // 競合グループがslotをまたぐ場合、同じグループの別slotへ入れた自分の票を取り消し、1グループ1票を保つ。
        await retractVotes(supersededSlotIds, userId)
      },
      '投票を反映しました',
      '投票を反映できませんでした',
    )
  }

  async function handleConfirm(slotId: string, optionId: string) {
    if (!planState) return
    await performAction(
      `confirm:${optionId}`,
      () => confirmOption(slotId, optionId, planState.plan.current_version),
      '最多票の案を確定しました',
      '採用案を確定できませんでした',
    )
  }

  async function handleRestore(version: number) {
    if (!planState) return
    await performAction(
      `restore:${version}`,
      () => restorePlanVersion(planState.plan.id, version, planState.plan.current_version),
      `バージョン ${version} を新しい最新版として復元しました`,
      `バージョン ${version} を復元できませんでした`,
    )
    setRestoreTargetVersion(null)
    setPreviewVersionNumber(null)
  }

  if (initialLoading) return <LoadingState label="タイムラインプランを読み込み中" />

  if (!trip || !planState) {
    return (
      <div className="space-y-4">
        <ErrorState message={error ?? '旅行またはプランが見つかりません'} />
        <button className="min-h-11 rounded-lg border bg-background px-4 text-sm font-medium" onClick={() => void loadInitial()} type="button">
          もう一度読み込む
        </button>
      </div>
    )
  }

  const displayedVersion = selectedPreviewVersion?.version ?? planState.plan.current_version
  const displayedAt = selectedPreviewVersion?.created_at ?? planState.plan.updated_at

  return (
    <div className="page-shell plan-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">SCREEN 02 · TIMELINE PLAN</span>
          <h1>タイムラインプラン</h1>
          <p>候補を並べて、みんなの投票で旅の流れを決めよう。</p>
          <span className="trip-context">
            {trip.title} ・ {formatTripPeriod(trip, timeZone)}
          </span>
        </div>
        <div className="title-actions">
          <Link className="secondary-button" to={`/trips/${tripId}/ideas`}>
            ← 付箋を見る
          </Link>
          <Link className="primary-button" to={`/calendar?tripId=${encodeURIComponent(tripId)}`}>
            カレンダーへ →
          </Link>
        </div>
      </div>

      {error && (
        <div className="plan-feedback">
          <ErrorState message={error} />
        </div>
      )}

      {(refreshing || notice) && (
        <div aria-live="polite" className="plan-status" role="status">
          {refreshing ? (
            <LoaderCircle aria-hidden="true" className="status-icon animate-spin" />
          ) : (
            <Check aria-hidden="true" className="status-icon" />
          )}
          <span>{refreshing ? '最新のプランを同期中' : notice}</span>
        </div>
      )}

      {isPreviewing && selectedPreviewVersion && (
        <section aria-live="polite" className="preview-banner">
          <div>
            <strong>履歴バージョン {selectedPreviewVersion.version} をプレビュー中</strong>
            <p>現在のプランは変更されていません。投票は履歴に含まれないため表示していません。</p>
          </div>
          <button className="secondary-button" onClick={() => setPreviewVersionNumber(null)} type="button">
            現在のプランに戻る
          </button>
        </section>
      )}

      <div className="timeline-layout">
        <section aria-labelledby="timeline-heading" className="surface-card timeline-card">
          <div className="plan-toolbar">
            <div className="toolbar-left">
              <div className="date-switch">
                <button
                  aria-label="前の日を見る"
                  disabled={activeDateIndex <= 0 || slotGroups.length === 0}
                  onClick={() => setActiveDateKey(slotGroups[activeDateIndex - 1]?.key ?? null)}
                  type="button"
                >
                  ‹
                </button>
                <span id="timeline-heading">{activeSlotGroup?.label ?? '日程未設定'}</span>
                <button
                  aria-label="次の日を見る"
                  disabled={activeDateIndex >= slotGroups.length - 1 || slotGroups.length === 0}
                  onClick={() => setActiveDateKey(slotGroups[activeDateIndex + 1]?.key ?? null)}
                  type="button"
                >
                  ›
                </button>
              </div>
              <span className="tag">
                <span className="dot" />
                {isPreviewing ? '履歴' : '現在'} v{displayedVersion}
              </span>
            </div>
            <div className="toolbar-right">
              <span className="last-updated">
                {isPreviewing ? '保存日時' : '最終更新'}{' '}
                <time dateTime={displayedAt}>{formatDateTime(displayedAt, timeZone)}</time>
              </span>
              <button
                className="primary-button generate-button"
                disabled={Boolean(actionKey) || isPreviewing}
                onClick={() => void handleGenerate()}
                title={isPreviewing ? '履歴プレビューを終了してから実行してください' : undefined}
                type="button"
              >
                {actionKey === 'generate' ? (
                  <LoaderCircle aria-hidden="true" className="button-icon animate-spin" />
                ) : (
                  <Sparkles aria-hidden="true" className="button-icon" />
                )}
                {actionKey === 'generate' ? 'AIが構成中' : isRegeneration ? 'AIで再生成' : 'AIで生成'}
              </button>
              <button
                aria-controls="plan-history-drawer"
                aria-expanded={historyOpen}
                className="history-button"
                onClick={() => setHistoryOpen((open) => !open)}
                type="button"
              >
                <History aria-hidden="true" className="button-icon" />
                変更履歴 <span>（{versions.length}）</span>
              </button>
            </div>
          </div>

          <div className="timeline-guide">
            投票できるのは時間が競合している案だけです。開始・終了時刻が重なる予定は、別々に生成されていても同じ競合グループにまとめます。時間が重なっていない競合は同じ行にまとめ、囲み枠と「競合A / 競合B」のラベルでどれとどれが同じ投票の選択肢かを示します。確定した予定と競合していない予定は上段の行にまとめ、採用案と時間が重なったまま残った案は別々に生成されていても下段の不採用の行に移します。
          </div>
          <div aria-label="予定の種類" className="plan-legend">
            <span className="plan-legend-item">
              <i className="plan-legend-swatch conflict" />競合候補 / 投票中
            </span>
            <span className="plan-legend-item">
              <i className="plan-legend-swatch ai" />競合なし / AI提案
            </span>
          </div>

          {!activeSlotGroup ? (
            <div className="timeline-empty">
              <Sparkles aria-hidden="true" />
              <h2>まだタイムラインがありません</h2>
              <p>アイデアボードの有効な付箋をもとに、「AIで生成」から旅程を作成できます。</p>
            </div>
          ) : (
            <div className="timeline-scroll">
              <div className="timeline" style={timelineGridStyle(timelineScale)}>
                <div className="timeline-head">
                  <div className="timeline-label">時間 / 案の比較</div>
                  <div
                    className="hours"
                    style={{ gridTemplateColumns: `repeat(${timelineScale.hours.length}, minmax(74px, 1fr))` }}
                  >
                    {timelineScale.hours.map((hour) => (
                      <span key={hour}>{formatHourLabel(hour, timeZone)}</span>
                    ))}
                  </div>
                </div>
                <TimelineRows
                  actionKey={actionKey}
                  onConfirm={(slotId, optionId) => void handleConfirm(slotId, optionId)}
                  onVote={(slotId, optionId, supersededSlotIds) => void handleVote(slotId, optionId, supersededSlotIds)}
                  optionsBySlot={optionsBySlot}
                  previewMode={isPreviewing}
                  scale={timelineScale}
                  slots={activeSlotGroup.slots}
                  timeZone={timeZone}
                  tripId={tripId}
                  userId={userId}
                  votes={displayVotes}
                />
              </div>
            </div>
          )}

          <div className="source-strip">
            <span aria-hidden="true">↗</span>
            <span>このプランは画面1の付箋から作られています</span>
            <Link to={`/trips/${tripId}/ideas`}>付箋を編集して更新する</Link>
          </div>
        </section>

        <HistoryDrawer
          actionKey={actionKey}
          currentVersion={planState.plan.current_version}
          hidden={!historyOpen}
          onCancelRestore={() => setRestoreTargetVersion(null)}
          onClose={() => setHistoryOpen(false)}
          onRequestRestore={(version) => {
            setRestoreTargetVersion(version)
            setPreviewVersionNumber(version)
          }}
          onRestore={(version) => void handleRestore(version)}
          onTogglePreview={(version) => {
            setPreviewVersionNumber((current) => (current === version ? null : version))
            setRestoreTargetVersion(null)
          }}
          panelRef={historyPanelRef}
          planState={planState}
          previewVersionNumber={previewVersionNumber}
          restoreTargetVersion={restoreTargetVersion}
          timeZone={timeZone}
          userId={userId}
          versions={versions}
        />
      </div>
    </div>
  )
}

type TimelineScale = {
  start: number
  end: number
  hours: number[]
}

type TimelineRowsProps = {
  slots: PlanSlot[]
  optionsBySlot: Map<string, PlanOption[]>
  votes: Vote[]
  userId: string
  tripId: string
  timeZone: string
  actionKey: string | null
  previewMode: boolean
  scale: TimelineScale
  onVote: (slotId: string, optionId: string, supersededSlotIds: string[]) => void
  onConfirm: (slotId: string, optionId: string) => void
}

function TimelineRows({ slots, optionsBySlot, ...props }: TimelineRowsProps) {
  const { conflictRows, confirmedRows, rejectedOptions, conflictNumbers } = buildTimeline(slots, optionsBySlot)

  if (conflictRows.length === 0 && confirmedRows.length === 0) {
    return (
      <div className="timeline-rows">
        <section className="timeline-row">
          <div className="row-label">
            <span className="candidate-name">候補なし</span>
          </div>
          <div className="time-track">
            <p className="timeline-row-empty">この日には候補がありません。</p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="timeline-rows">
      {confirmedRows.map((groups) => (
        <SlotRow
          groupNumbers={conflictNumbers}
          groups={groups}
          key={groups[0].key}
          variant="confirmed"
          {...props}
        />
      ))}
      {conflictRows.map((groups) => (
        <SlotRow
          groupNumbers={conflictNumbers}
          groups={groups}
          key={groups[0].key}
          variant="conflict"
          {...props}
        />
      ))}
      {rejectedOptions.length > 0 && (
        <RejectedRow
          entries={rejectedOptions}
          scale={props.scale}
          timeZone={props.timeZone}
          tripId={props.tripId}
        />
      )}
    </div>
  )
}

type RejectedRowProps = {
  entries: RejectedOption[]
  scale: TimelineScale
  timeZone: string
  tripId: string
}

function RejectedRow({ entries, scale, timeZone, tripId }: RejectedRowProps) {
  const byOption = new Map(entries.map((entry) => [entry.option.id, entry.adoptedTitle]))

  return (
    <section aria-label="不採用の案" className="timeline-row rejected-row">
      <div className="row-label rejected-label">
        <span className="candidate-name">不採用の案</span>
        <span className="candidate-meta">{entries.length}件・採用案に時間を譲った案</span>
      </div>
      <div className="time-track">
        {assignLanes(entries.map((entry) => entry.option)).map((lane) => (
          <div className="option-lane" key={lane[0].id}>
            {lane.map((option) => (
              <ScheduleBlock
                key={option.id}
                option={option}
                originLabel={`不採用（「${byOption.get(option.id) ?? ''}」が採用）`}
                rejected
                scale={scale}
                timeZone={timeZone}
                tripId={tripId}
                variant="option"
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function assignLanes(options: PlanOption[]): PlanOption[][] {
  const lanes: PlanOption[][] = []
  for (const option of options) {
    const lane = lanes.find((entries) => timestamp(entries[entries.length - 1].end_at) <= timestamp(option.start_at))
    if (lane) lane.push(option)
    else lanes.push([option])
  }
  return lanes
}

type SlotRowProps = Omit<TimelineRowsProps, 'slots' | 'optionsBySlot'> & {
  groups: TimelineGroup[]
  groupNumbers: Map<string, number>
  variant: 'conflict' | 'confirmed'
}

function SlotRow({
  groups,
  groupNumbers,
  variant,
  votes,
  userId,
  tripId,
  timeZone,
  actionKey,
  previewMode,
  scale,
  onVote,
  onConfirm,
}: SlotRowProps) {
  const isConfirmedRow = variant === 'confirmed'
  const laneCount = Math.max(...groups.map((group) => group.entries.length), 1)
  const lanes = Array.from({ length: laneCount }, (_, lane) =>
    groups.flatMap((group) => {
      const entry = group.entries[lane]
      return entry ? [{ group, entry }] : []
    }),
  )
  const optionCount = groups.reduce((total, group) => total + group.entries.length, 0)

  return (
    <section
      aria-label={isConfirmedRow ? '確定した予定' : '競合候補'}
      className={`timeline-row ${isConfirmedRow ? 'confirmed-row' : 'candidate-row'}`}
    >
      <div className={`row-label ${isConfirmedRow ? 'confirmed-label' : 'candidate-label'}`}>
        <span className="candidate-name">{isConfirmedRow ? '確定した予定' : '競合候補'}</span>
        <span className="candidate-meta">
          {isConfirmedRow
            ? `${groups.length}件・採用済みと競合なしの予定`
            : previewMode
              ? `${groups.length}件の競合・履歴プレビュー`
              : `${groups.length}件の競合・${optionCount}案から投票`}
        </span>
      </div>
      <div className="time-track">
        {groups.map((group) => {
          const groupIndex = groupNumbers.get(group.key) ?? 0
          return (
            <div
              className={`slot-band ${isConfirmedRow ? 'confirmed-band' : 'conflict-band'}`}
              key={group.key}
              style={{ ...timelineSpanStyle(group, scale), '--group-accent': groupAccent(groupIndex) } as CSSProperties}
            >
              <span className="slot-band-label">
                {isConfirmedRow
                  ? group.entries[0]?.slot.status === 'confirmed'
                    ? '確定'
                    : '競合なし'
                  : `競合${groupLabel(groupIndex)} ${formatTimeRange(toIsoString(group.start), toIsoString(group.end), timeZone)} ・ ${group.entries.length}案から1つ`}
              </span>
            </div>
          )
        })}
        {lanes.map((lane, laneIndex) => (
          <div className="option-lane" key={lane[0]?.entry.option.id ?? laneIndex}>
            {lane.map(({ group, entry }) => (
              <SlotOptionBlock
                actionKey={actionKey}
                entry={entry}
                group={group}
                groupIndex={groupNumbers.get(group.key) ?? 0}
                key={entry.option.id}
                lane={laneIndex}
                onConfirm={onConfirm}
                onVote={onVote}
                previewMode={previewMode}
                scale={scale}
                timeZone={timeZone}
                tripId={tripId}
                userId={userId}
                votes={votes}
              />
            ))}
          </div>
        ))}
        {optionCount === 0 && <p className="timeline-row-empty">この時間帯には候補がありません。</p>}
      </div>
    </section>
  )
}

type SlotOptionBlockProps = {
  group: TimelineGroup
  entry: SlotEntry
  groupIndex: number
  lane: number
  votes: Vote[]
  userId: string
  tripId: string
  timeZone: string
  actionKey: string | null
  previewMode: boolean
  scale: TimelineScale
  onVote: (slotId: string, optionId: string, supersededSlotIds: string[]) => void
  onConfirm: (slotId: string, optionId: string) => void
}

function SlotOptionBlock({
  group,
  entry,
  groupIndex,
  lane,
  votes,
  userId,
  tripId,
  timeZone,
  actionKey,
  previewMode,
  scale,
  onVote,
  onConfirm,
}: SlotOptionBlockProps) {
  const { slot, option } = entry
  // 競合グループはslotをまたぐことがあるので、票は各案の所属slotと組み合わせて数える。
  const countFor = (target: SlotEntry) =>
    votes.filter((vote) => vote.slot_id === target.slot.id && vote.option_id === target.option.id).length
  const maximumVotes = Math.max(0, ...group.entries.map(countFor))
  const topOptionIds = new Set(
    maximumVotes > 0
      ? group.entries.filter((target) => countFor(target) === maximumVotes).map((target) => target.option.id)
      : [],
  )
  const ownEntry = group.entries.find((target) =>
    votes.some(
      (vote) =>
        vote.slot_id === target.slot.id && vote.option_id === target.option.id && vote.user_id === userId,
    ),
  )
  const superseded = supersededSlotIds(group, slot.id)

  const slotIsConfirmed = slot.status === 'confirmed'
  const isConfirmedOption = slot.confirmed_option_id === option.id
  // 競合していない予定には選びようがないので、確定済みと同じように投票を出さない。
  const isSoleOption = !slotIsConfirmed && group.entries.length === 1
  const count = countFor(entry)
  const isOwnVote = ownEntry?.option.id === option.id
  const isTop = topOptionIds.has(option.id)
  const tiedForTop = topOptionIds.size > 1

  return (
    <ScheduleBlock
      accent={groupAccent(groupIndex)}
      option={option}
      originLabel={
        slotIsConfirmed
          ? isConfirmedOption
            ? '採用済み'
            : '不採用'
          : isSoleOption
            ? option.note_id
              ? `${kindLabel(option.kind)}の予定`
              : 'AIが空き時間に提案'
            : `競合${groupLabel(groupIndex)}の候補 ${lane + 1}/${group.entries.length}`
      }
      rejected={slotIsConfirmed && !isConfirmedOption}
      scale={scale}
      timeZone={timeZone}
      tripId={tripId}
      variant={isConfirmedOption ? 'draft' : isSoleOption ? 'ai-suggestion' : 'option'}
    >
      {previewMode ? (
        <span className="schedule-reason">履歴には投票数が保存されていません</span>
      ) : isSoleOption ? (
        <span className="schedule-reason">時間が競合していないため、投票せずに反映されます</span>
      ) : slotIsConfirmed ? (
        <span className="schedule-reason">
          {isConfirmedOption ? 'この案が採用されています' : '別の案が採用されています'}
        </span>
      ) : (
        <div className="vote-row">
          <button
            aria-pressed={isOwnVote}
            className={`vote-button${isOwnVote ? ' voted' : ''}`}
            disabled={Boolean(actionKey) || isOwnVote}
            onClick={() => onVote(slot.id, option.id, superseded)}
            type="button"
          >
            {actionKey === `vote:${option.id}` ? '投票中…' : isOwnVote ? '投票済み' : 'この案に投票'}
          </button>
          <span className="vote-count">{count}票</span>
          {isTop && (
            <button
              className="adopt-button"
              disabled={Boolean(actionKey)}
              onClick={() => onConfirm(slot.id, option.id)}
              type="button"
            >
              {actionKey === `confirm:${option.id}` ? '確定中…' : tiedForTop ? '同率最多から採用' : '最多票案を採用'}
            </button>
          )}
        </div>
      )}
    </ScheduleBlock>
  )
}

function groupLabel(index: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + (index % 26))
}

function groupAccent(index: number): string {
  return GROUP_ACCENTS[index % GROUP_ACCENTS.length]
}

type ScheduleBlockProps = {
  option: PlanOption
  scale: TimelineScale
  timeZone: string
  tripId: string
  variant: 'option' | 'ai-suggestion' | 'draft'
  originLabel: string
  accent?: string
  rejected?: boolean
  children?: ReactNode
}

function ScheduleBlock({
  option,
  scale,
  timeZone,
  tripId,
  variant,
  originLabel,
  accent,
  rejected = false,
  children,
}: ScheduleBlockProps) {
  const metadata = optionMetadata(option)

  return (
    <article
      className={`schedule-block ${variant}${rejected ? ' rejected' : ''}`}
      style={{ gridColumn: timelineGridColumn(option, scale), '--group-accent': accent } as CSSProperties}
    >
      <span className="schedule-origin">{originLabel}</span>
      <h3 className="schedule-title">{option.title}</h3>
      <p className="schedule-meta">
        {option.kind === 'all_day' ? '終日予定' : formatTimeRange(option.start_at, option.end_at, timeZone)}
        {metadata[0] ? ` · ${metadata[0].value}` : ''}
      </p>
      {option.reason && <span className="schedule-reason">{option.reason}</span>}
      {option.note_id && (
        <Link className="schedule-note" to={`/trips/${tripId}/ideas#${encodeURIComponent(option.note_id)}`}>
          元の付箋を見る ↗
        </Link>
      )}
      {children}
    </article>
  )
}

type HistoryDrawerProps = {
  hidden: boolean
  versions: PlanVersion[]
  currentVersion: number
  previewVersionNumber: number | null
  restoreTargetVersion: number | null
  actionKey: string | null
  userId: string
  timeZone: string
  planState: PlanState
  panelRef: RefObject<HTMLElement | null>
  onClose: () => void
  onTogglePreview: (version: number) => void
  onRequestRestore: (version: number) => void
  onCancelRestore: () => void
  onRestore: (version: number) => void
}

function HistoryDrawer({
  hidden,
  versions,
  currentVersion,
  previewVersionNumber,
  restoreTargetVersion,
  actionKey,
  userId,
  timeZone,
  planState,
  panelRef,
  onClose,
  onTogglePreview,
  onRequestRestore,
  onCancelRestore,
  onRestore,
}: HistoryDrawerProps) {
  const groups = groupVersionsByDate(versions, timeZone)

  return (
    <aside
      aria-labelledby="plan-history-title"
      className="history-drawer"
      hidden={hidden}
      id="plan-history-drawer"
      ref={panelRef}
      tabIndex={-1}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card p-4">
        <div>
          <h2 className="font-semibold" id="plan-history-title">
            変更履歴
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">新しい順・保存日ごとに表示</p>
        </div>
        <Button
          aria-label="変更履歴を閉じる"
          className="min-h-11 min-w-11"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">変更履歴はまだありません。</p>
      ) : (
        <div className="space-y-6 p-4">
          {groups.map((group) => (
            <section aria-labelledby={`history-date-${group.key}`} key={group.key}>
              <h3 className="mb-3 text-xs font-semibold text-muted-foreground" id={`history-date-${group.key}`}>
                {group.label}
              </h3>
              <ol className="space-y-3 border-l pl-4">
                {group.versions.map((version) => {
                  const isCurrent = version.version === currentVersion
                  const isPreviewed = version.version === previewVersionNumber
                  const isRestoreTarget = version.version === restoreTargetVersion
                  const restoreBusy = actionKey === `restore:${version.version}`

                  return (
                    <li className="relative rounded-lg border bg-background p-3 before:absolute before:-left-[1.32rem] before:top-5 before:size-2.5 before:rounded-full before:border before:bg-card" key={version.version}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold">v{version.version}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {isCurrent && <span className="rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold">現在</span>}
                          {isPreviewed && !isCurrent && (
                            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[0.7rem] font-semibold">
                              プレビュー中
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <time dateTime={version.created_at}>{formatHistoryTime(version.created_at, timeZone)}</time>
                        {' ・ '}
                        {actorLabel(version.actor_id, userId)}
                      </p>
                      <p className="mt-1 text-xs font-medium">{sourceLabel(version.source)}</p>
                      <p className="mt-2 text-sm leading-relaxed">{version.summary}</p>

                      {!isCurrent && (
                        <div className="mt-3 grid gap-2">
                          <Button
                            className="min-h-11 whitespace-normal"
                            disabled={Boolean(actionKey)}
                            onClick={() => onTogglePreview(version.version)}
                            type="button"
                            variant="outline"
                          >
                            <Eye aria-hidden="true" className="size-4" />
                            {isPreviewed ? 'プレビューを閉じる' : '概要とタイムラインをプレビュー'}
                          </Button>
                          <Button
                            className="min-h-11 whitespace-normal"
                            disabled={Boolean(actionKey)}
                            onClick={() => onRequestRestore(version.version)}
                            type="button"
                            variant="secondary"
                          >
                            <RotateCcw aria-hidden="true" className="size-4" /> この版を復元
                          </Button>
                        </div>
                      )}

                      {isPreviewed && (
                        <SnapshotOverview currentState={planState} timeZone={timeZone} version={version} />
                      )}

                      {isRestoreTarget && !isCurrent && (
                        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3" role="alert">
                          <p className="text-sm font-semibold">v{version.version} を復元しますか？</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            タイムラインの構造と確定状態をこの版へ戻し、復元結果を新しい履歴として追加します。参加者の投票は維持されます。
                          </p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Button
                              className="min-h-11 whitespace-normal"
                              disabled={Boolean(actionKey)}
                              onClick={() => onRestore(version.version)}
                              type="button"
                              variant="destructive"
                            >
                              {restoreBusy ? (
                                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                              ) : (
                                <RotateCcw aria-hidden="true" className="size-4" />
                              )}
                              {restoreBusy ? '復元中' : '復元を実行'}
                            </Button>
                            <Button
                              className="min-h-11"
                              disabled={Boolean(actionKey)}
                              onClick={onCancelRestore}
                              type="button"
                              variant="outline"
                            >
                              キャンセル
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </aside>
  )
}

function SnapshotOverview({
  version,
  currentState,
  timeZone,
}: {
  version: PlanVersion
  currentState: PlanState
  timeZone: string
}) {
  const snapshot = parsePlanSnapshot(version.snapshot)
  if (!snapshot) {
    return (
      <div className="mt-3 rounded-lg border p-3 text-xs text-muted-foreground" role="status">
        このバージョンのプレビュー概要を読み取れませんでした。
      </div>
    )
  }

  const confirmedCount = snapshot.slots.filter(
    (slot) => slot.status === 'confirmed' && snapshot.options.some((option) => option.id === slot.confirmed_option_id),
  ).length
  const difference = planDifference(snapshot, currentState)
  const period = snapshotPeriod(snapshot, timeZone)
  const titles = snapshot.options.map((option) => option.title).slice(0, 4)

  return (
    <section aria-label={`バージョン ${version.version} のプレビュー概要`} className="mt-3 rounded-lg border bg-muted/20 p-3">
      <h4 className="text-xs font-semibold">プレビュー概要</h4>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-background p-2">
          <dt className="text-[0.65rem] text-muted-foreground">時間帯</dt>
          <dd className="mt-1 text-sm font-semibold">{snapshot.slots.length}件</dd>
        </div>
        <div className="rounded-md bg-background p-2">
          <dt className="text-[0.65rem] text-muted-foreground">候補</dt>
          <dd className="mt-1 text-sm font-semibold">{snapshot.options.length}件</dd>
        </div>
        <div className="rounded-md bg-background p-2">
          <dt className="text-[0.65rem] text-muted-foreground">確定</dt>
          <dd className="mt-1 text-sm font-semibold">{confirmedCount}件</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">対象期間：{period}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        この版から現在までの差分：追加 {difference.added}件・変更 {difference.changed}件・削除 {difference.removed}件
      </p>
      {titles.length > 0 && <p className="mt-2 text-xs leading-relaxed">候補：{titles.join('、')}{snapshot.options.length > titles.length ? ' ほか' : ''}</p>}
      <p className="mt-2 text-[0.7rem] text-muted-foreground">投票は履歴・復元の対象外です。</p>
    </section>
  )
}

function parsePlanSnapshot(value: unknown): PlanSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.slots) || !Array.isArray(value.options)) return null
  if (!value.slots.every(isPlanSlot) || !value.options.every(isPlanOption)) return null
  return { slots: value.slots, options: value.options }
}

function isPlanSlot(value: unknown): value is PlanSlot {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.plan_id === 'string' &&
    typeof value.start_at === 'string' &&
    typeof value.end_at === 'string' &&
    (value.status === 'open' || value.status === 'confirmed') &&
    isNullableString(value.confirmed_option_id) &&
    typeof value.revision === 'number' &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    isNullableString(value.deleted_at)
  )
}

function isPlanOption(value: unknown): value is PlanOption {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.slot_id === 'string' &&
    isNullableString(value.note_id) &&
    typeof value.title === 'string' &&
    typeof value.start_at === 'string' &&
    typeof value.end_at === 'string' &&
    (value.kind === 'activity' || value.kind === 'travel' || value.kind === 'all_day' || value.kind === 'placeholder') &&
    isRecord(value.attrs) &&
    isNullableString(value.reason) &&
    typeof value.user_touched === 'boolean' &&
    typeof value.revision === 'number' &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    isNullableString(value.deleted_at)
  )
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function planDifference(snapshot: PlanSnapshot, currentState: PlanState) {
  const slotDifference = compareEntityMaps(
    new Map(snapshot.slots.map((slot) => [slot.id, slotSignature(slot)])),
    new Map(currentState.slots.map((slot) => [slot.id, slotSignature(slot)])),
  )
  const optionDifference = compareEntityMaps(
    new Map(snapshot.options.map((option) => [option.id, optionSignature(option)])),
    new Map(currentState.options.map((option) => [option.id, optionSignature(option)])),
  )
  return {
    added: slotDifference.added + optionDifference.added,
    changed: slotDifference.changed + optionDifference.changed,
    removed: slotDifference.removed + optionDifference.removed,
  }
}

function compareEntityMaps(before: Map<string, string>, current: Map<string, string>) {
  let added = 0
  let changed = 0
  let removed = 0
  for (const [id, signature] of current) {
    if (!before.has(id)) added += 1
    else if (before.get(id) !== signature) changed += 1
  }
  for (const id of before.keys()) {
    if (!current.has(id)) removed += 1
  }
  return { added, changed, removed }
}

function slotSignature(slot: PlanSlot): string {
  return JSON.stringify({
    start_at: slot.start_at,
    end_at: slot.end_at,
    status: slot.status,
    confirmed_option_id: slot.confirmed_option_id,
  })
}

function optionSignature(option: PlanOption): string {
  return JSON.stringify({
    slot_id: option.slot_id,
    note_id: option.note_id,
    title: option.title,
    start_at: option.start_at,
    end_at: option.end_at,
    kind: option.kind,
    attrs: normalizeJson(option.attrs),
    reason: option.reason,
    user_touched: option.user_touched,
  })
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeJson(value[key])]))
}

function createTimelineScale(slots: PlanSlot[], options: PlanOption[], _timeZone: string): TimelineScale {
  const starts = [...slots.map((slot) => timestamp(slot.start_at)), ...options.map((option) => timestamp(option.start_at))]
    .filter(Number.isFinite)
  const ends = [...slots.map((slot) => timestamp(slot.end_at)), ...options.map((option) => timestamp(option.end_at))]
    .filter(Number.isFinite)
  const hour = 60 * 60 * 1000
  const fallbackStart = new Date().setHours(9, 0, 0, 0)
  const start = starts.length ? Math.floor(Math.min(...starts) / hour) * hour : fallbackStart
  const rawEnd = ends.length ? Math.ceil(Math.max(...ends) / hour) * hour : start + 10 * hour
  const end = rawEnd > start ? rawEnd : start + hour
  const hourCount = Math.max(1, Math.min(24, Math.ceil((end - start) / hour)))
  return {
    start,
    end,
    hours: Array.from({ length: hourCount }, (_, index) => start + index * hour),
  }
}

function timelineGridStyle(scale: TimelineScale): CSSProperties {
  return {
    '--timeline-hours': scale.hours.length,
    '--timeline-columns': scale.hours.length * COLUMNS_PER_HOUR,
  } as CSSProperties
}

function timelineGridColumn(option: PlanOption, scale: TimelineScale): string {
  const columns = scale.hours.length * COLUMNS_PER_HOUR
  if (option.kind === 'all_day') return `1 / span ${columns}`
  const columnDuration = (60 / COLUMNS_PER_HOUR) * 60 * 1000
  const optionStart = timestamp(option.start_at)
  const optionEnd = timestamp(option.end_at)
  if (!Number.isFinite(optionStart) || !Number.isFinite(optionEnd)) return `1 / span ${COLUMNS_PER_HOUR}`
  const startColumn = clamp(Math.floor((optionStart - scale.start) / columnDuration), 0, columns - 1)
  const endColumn = clamp(Math.ceil((optionEnd - scale.start) / columnDuration), startColumn + 1, columns)
  return `${startColumn + 1} / span ${endColumn - startColumn}`
}

function timelineSpanStyle(bounds: { start: number; end: number }, scale: TimelineScale): CSSProperties {
  const duration = Math.max(1, scale.end - scale.start)
  const left = clamp(((bounds.start - scale.start) / duration) * 100, 0, 100)
  const width = clamp(((bounds.end - bounds.start) / duration) * 100, 1, 100 - left)
  return { left: `${left}%`, width: `${width}%` }
}

function toIsoString(value: number): string {
  return new Date(value).toISOString()
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function formatHourLabel(value: number, timeZone: string): string {
  return formatValue(new Date(value).toISOString(), timeZone, { hour: '2-digit', minute: '2-digit', hour12: false })
}

function groupSlotsByDate(slots: PlanSlot[], timeZone: string) {
  const groups = new Map<string, { key: string; label: string; slots: PlanSlot[] }>()
  for (const slot of [...slots].sort((left, right) => timestamp(left.start_at) - timestamp(right.start_at))) {
    const key = formatDateKey(slot.start_at, timeZone)
    const group = groups.get(key) ?? { key, label: formatDate(slot.start_at, timeZone), slots: [] }
    group.slots.push(slot)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function groupVersionsByDate(versions: PlanVersion[], timeZone: string) {
  const groups = new Map<string, { key: string; label: string; versions: PlanVersion[] }>()
  const sorted = [...versions].sort((left, right) => right.version - left.version)
  for (const version of sorted) {
    const key = formatDateKey(version.created_at, timeZone)
    const group = groups.get(key) ?? { key, label: formatDate(version.created_at, timeZone), versions: [] }
    group.versions.push(version)
    groups.set(key, group)
  }
  return [...groups.values()]
}

function optionMetadata(option: PlanOption): Array<{ label: string; value: string }> {
  if (!isRecord(option.attrs)) return []
  const details: Array<{ label: string; value: string }> = []
  const location = scalarText(option.attrs.address) ?? scalarText(option.attrs.location)
  const duration = scalarText(option.attrs.duration)
  const timeHint = scalarText(option.attrs.time_hint)
  const cost = scalarText(option.attrs.cost)
  const memo = scalarText(option.attrs.memo)
  if (location) details.push({ label: '場所', value: location })
  if (duration) details.push({ label: '所要時間', value: typeof option.attrs.duration === 'number' ? `${duration}分` : duration })
  if (timeHint) details.push({ label: '希望時間', value: timeHint })
  if (cost) details.push({ label: '費用', value: cost })
  if (memo) details.push({ label: 'メモ', value: memo })
  return details.slice(0, 4)
}

function scalarText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'あり' : 'なし'
  return null
}

function kindLabel(kind: PlanOption['kind']): string {
  const labels: Record<PlanOption['kind'], string> = {
    activity: 'アクティビティ',
    travel: '移動',
    all_day: '終日',
    placeholder: '未定',
  }
  return labels[kind]
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    note_update: '付箋から更新',
    calendar_edit: 'カレンダーから更新',
    manual_edit: '手動編集',
    ai_generate: 'AI生成',
    ai_regenerate: 'AI再生成',
    confirm: '採用案を確定',
    unconfirm: '確定を解除',
    restore: '過去版を復元',
  }
  return labels[source] ?? source
}

function actorLabel(actorId: string | null, userId: string): string {
  if (!actorId) return '匿名ユーザー'
  return actorId === userId ? 'あなた' : '参加者'
}

function snapshotPeriod(snapshot: PlanSnapshot, timeZone: string): string {
  if (snapshot.slots.length === 0) return '予定なし'
  const starts = snapshot.slots.map((slot) => timestamp(slot.start_at)).filter(Number.isFinite)
  const ends = snapshot.slots.map((slot) => timestamp(slot.end_at)).filter(Number.isFinite)
  if (!starts.length || !ends.length) return '日時不明'
  return `${formatDateTime(new Date(Math.min(...starts)).toISOString(), timeZone)} 〜 ${formatDateTime(
    new Date(Math.max(...ends)).toISOString(),
    timeZone,
  )}`
}

function formatTripPeriod(trip: Trip, timeZone: string): string {
  if (!trip.starts_at && !trip.ends_at) return '日程未設定'
  if (trip.starts_at && trip.ends_at) {
    return `${formatDate(trip.starts_at, timeZone)} 〜 ${formatDate(trip.ends_at, timeZone)}`
  }
  return formatDate(trip.starts_at ?? trip.ends_at ?? '', timeZone)
}

function formatDate(value: string, timeZone: string): string {
  return formatValue(value, timeZone, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

function formatDateKey(value: string, timeZone: string): string {
  return formatValue(value, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function formatDateTime(value: string, timeZone: string): string {
  return formatValue(value, timeZone, {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatHistoryTime(value: string, timeZone: string): string {
  return formatValue(value, timeZone, { hour: '2-digit', minute: '2-digit' })
}

function formatTimeRange(startAt: string, endAt: string, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
  return `${formatValue(startAt, timeZone, options)}–${formatValue(endAt, timeZone, options)}`
}

function formatValue(value: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '日時不明'
  try {
    return new Intl.DateTimeFormat('ja-JP', { ...options, timeZone }).format(date)
  } catch {
    return new Intl.DateTimeFormat('ja-JP', options).format(date)
  }
}

function toErrorMessage(reason: unknown, fallback: string): string {
  const message =
    reason instanceof Error
      ? reason.message
      : isRecord(reason) && typeof reason.message === 'string'
        ? reason.message
        : fallback
  if (message.includes('VERSION_CONFLICT')) return `${fallback}。ほかの参加者の変更を反映してから、もう一度お試しください。`
  if (message.includes('NOT_TOP_VOTED')) return `${fallback}。現在の最多票案を選んでください。`
  return message || fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
