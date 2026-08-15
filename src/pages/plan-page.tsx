import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  ArrowLeft,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  History,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  Vote as VoteIcon,
  X,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '@/components/layout/states'
import { Button } from '@/components/ui/button'
import {
  castVote,
  confirmOption,
  getPlanState,
  listPlanVersions,
  restorePlanVersion,
  subscribeToPlan,
  type PlanState,
} from '@/repositories/plans.repository'
import { getPlanForTrip, getTrip } from '@/repositories/trips.repository'
import { generatePlan } from '@/services/ai.service'
import type { PlanOption, PlanSlot, PlanSnapshot, PlanVersion, Trip, Vote } from '@/types/domain'

const EMPTY_SLOTS: PlanSlot[] = []
const EMPTY_OPTIONS: PlanOption[] = []
const EMPTY_VOTES: Vote[] = []

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

  async function handleVote(slotId: string, optionId: string) {
    await performAction(
      `vote:${optionId}`,
      () => castVote(slotId, optionId),
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
        <Button className="min-h-11" onClick={() => void loadInitial()} type="button" variant="outline">
          もう一度読み込む
        </Button>
      </div>
    )
  }

  const displayedVersion = selectedPreviewVersion?.version ?? planState.plan.current_version
  const displayedAt = selectedPreviewVersion?.created_at ?? planState.plan.updated_at

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {trip.title} ・ {formatTripPeriod(trip, timeZone)}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">タイムラインプラン</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            時間帯ごとの候補を比較し、投票で旅の流れを決めます。
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            to={`/trips/${tripId}/ideas`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            付箋を見る
          </Link>
          <Button
            className="min-h-11 px-4"
            disabled={Boolean(actionKey) || isPreviewing}
            onClick={() => void handleGenerate()}
            title={isPreviewing ? '履歴プレビューを終了してから実行してください' : undefined}
            type="button"
          >
            {actionKey === 'generate' ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="size-4" />
            )}
            {actionKey === 'generate' ? 'AIが構成中' : isRegeneration ? 'AIで再生成' : 'AIで生成'}
          </Button>
        </div>
      </header>

      {error && <ErrorState message={error} />}

      {(refreshing || notice) && (
        <div
          aria-live="polite"
          className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 text-sm text-muted-foreground"
          role="status"
        >
          {refreshing ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Check aria-hidden="true" className="size-4" />
          )}
          {refreshing ? '最新のプランを同期中' : notice}
        </div>
      )}

      {isPreviewing && selectedPreviewVersion && (
        <section className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
          <div>
            <p className="font-semibold">履歴バージョン {selectedPreviewVersion.version} をプレビュー中</p>
            <p className="mt-1 text-sm text-muted-foreground">
              現在のプランは変更されていません。投票は履歴に含まれないため表示していません。
            </p>
          </div>
          <Button className="min-h-11" onClick={() => setPreviewVersionNumber(null)} type="button" variant="outline">
            現在のプランに戻る
          </Button>
        </section>
      )}

      <div className={`grid items-start gap-4 ${historyOpen ? 'xl:grid-cols-[minmax(0,1fr)_23rem]' : ''}`}>
        <section aria-labelledby="timeline-heading" className="min-w-0 overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold" id="timeline-heading">
                旅程タイムライン
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium">
                <History aria-hidden="true" className="size-3.5" />
                {isPreviewing ? '履歴' : '現在'} v{displayedVersion}
              </span>
              {refreshing && <span className="text-xs text-muted-foreground">再取得中</span>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs text-muted-foreground">
                {isPreviewing ? '保存日時' : '最終更新'}{' '}
                <time dateTime={displayedAt}>{formatDateTime(displayedAt, timeZone)}</time>
              </span>
              <Button
                aria-controls="plan-history-drawer"
                aria-expanded={historyOpen}
                className="min-h-11"
                onClick={() => setHistoryOpen((open) => !open)}
                type="button"
                variant="outline"
              >
                <History aria-hidden="true" className="size-4" />
                変更履歴（{versions.length}）
              </Button>
            </div>
          </div>

          <div className="border-b bg-muted/30 p-4 text-sm text-muted-foreground">
            <p>各行が投票単位の時間帯スロットです。同じスロットの候補を横に比較できます。</p>
            <div aria-label="状態の凡例" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <VoteIcon aria-hidden="true" className="size-4" /> 投票受付中
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 aria-hidden="true" className="size-4" /> 確定済み
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Trophy aria-hidden="true" className="size-4" /> 最多票
              </span>
            </div>
          </div>

          {displaySlots.length === 0 ? (
            <div className="grid min-h-64 place-items-center p-6 text-center">
              <div className="max-w-md">
                <Bot aria-hidden="true" className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-3 font-semibold">まだタイムラインがありません</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  アイデアボードの有効な付箋をもとに、上の「AIで生成」から旅程を作成できます。
                </p>
              </div>
            </div>
          ) : (
            <div>
              {slotGroups.map((group, groupIndex) => (
                <section aria-labelledby={`plan-day-${groupIndex}`} key={group.key}>
                  <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-3">
                    <CalendarDays aria-hidden="true" className="size-4" />
                    <h2 className="text-sm font-semibold" id={`plan-day-${groupIndex}`}>
                      {group.label}
                    </h2>
                    <span className="text-xs text-muted-foreground">{group.slots.length}時間帯</span>
                  </div>
                  <ol className="divide-y">
                    {group.slots.map((slot) => (
                      <TimelineSlot
                        actionKey={actionKey}
                        key={slot.id}
                        onConfirm={(slotId, optionId) => void handleConfirm(slotId, optionId)}
                        onVote={(slotId, optionId) => void handleVote(slotId, optionId)}
                        options={optionsBySlot.get(slot.id) ?? EMPTY_OPTIONS}
                        previewMode={isPreviewing}
                        slot={slot}
                        timeZone={timeZone}
                        tripId={tripId}
                        userId={userId}
                        votes={displayVotes.filter((vote) => vote.slot_id === slot.id)}
                      />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t bg-muted/20 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <ExternalLink aria-hidden="true" className="size-4" />
              このプランはアイデアボードの付箋から構成されています。
            </span>
            <Link
              className="inline-flex min-h-11 items-center font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              to={`/trips/${tripId}/ideas`}
            >
              元の付箋を確認・編集する
            </Link>
          </div>
        </section>

        {historyOpen && (
          <HistoryDrawer
            actionKey={actionKey}
            currentVersion={planState.plan.current_version}
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
        )}
      </div>
    </div>
  )
}

type TimelineSlotProps = {
  slot: PlanSlot
  options: PlanOption[]
  votes: Vote[]
  userId: string
  tripId: string
  timeZone: string
  actionKey: string | null
  previewMode: boolean
  onVote: (slotId: string, optionId: string) => void
  onConfirm: (slotId: string, optionId: string) => void
}

function TimelineSlot({
  slot,
  options,
  votes,
  userId,
  tripId,
  timeZone,
  actionKey,
  previewMode,
  onVote,
  onConfirm,
}: TimelineSlotProps) {
  const voteCounts = new Map(options.map((option) => [option.id, 0]))
  for (const vote of votes) {
    if (voteCounts.has(vote.option_id)) voteCounts.set(vote.option_id, (voteCounts.get(vote.option_id) ?? 0) + 1)
  }

  const maximumVotes = options.length ? Math.max(...options.map((option) => voteCounts.get(option.id) ?? 0)) : 0
  const topOptionIds = new Set(
    maximumVotes > 0
      ? options.filter((option) => (voteCounts.get(option.id) ?? 0) === maximumVotes).map((option) => option.id)
      : [],
  )
  const ownVote = votes.find((vote) => vote.user_id === userId)
  const ownOption = ownVote ? options.find((option) => option.id === ownVote.option_id) : undefined
  const slotIsConfirmed = slot.status === 'confirmed'
  const confirmedOptionExists = options.some((option) => option.id === slot.confirmed_option_id)

  return (
    <li className="grid md:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="border-b bg-muted/10 p-4 md:border-r md:border-b-0">
        <div className="flex items-center gap-2 font-semibold">
          <Clock3 aria-hidden="true" className="size-4" />
          {formatTimeRange(slot.start_at, slot.end_at, timeZone)}
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium">
          {slotIsConfirmed ? (
            <CheckCircle2 aria-hidden="true" className="size-4" />
          ) : (
            <VoteIcon aria-hidden="true" className="size-4" />
          )}
          {slotIsConfirmed
            ? confirmedOptionExists
              ? '確定済み'
              : '確定案を確認できません'
            : '投票受付中'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">候補 {options.length}件</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {previewMode
            ? '履歴プレビュー（投票情報なし）'
            : ownOption
              ? `あなたは「${ownOption.title}」に投票済み`
              : ownVote
                ? '以前の投票先は現在の候補にありません'
                : 'あなたは未投票'}
        </p>
      </div>

      <div className="grid gap-3 p-4 xl:grid-cols-2">
        {options.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">この時間帯には候補がありません。</p>
        ) : (
          options.map((option) => {
            const count = voteCounts.get(option.id) ?? 0
            const isTop = topOptionIds.has(option.id)
            const tiedForTop = topOptionIds.size > 1
            const isOwnVote = ownOption?.id === option.id
            const isConfirmedOption = slot.confirmed_option_id === option.id
            const isNotSelected = slotIsConfirmed && !isConfirmedOption
            const metadata = optionMetadata(option)
            const voteBusy = actionKey === `vote:${option.id}`
            const confirmBusy = actionKey === `confirm:${option.id}`

            return (
              <article
                className={`flex min-w-0 flex-col rounded-xl border p-4 ${
                  isConfirmedOption
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : isNotSelected
                      ? 'border-dashed bg-muted/20'
                      : 'bg-background'
                }`}
                key={option.id}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border px-2 py-1 font-medium">{kindLabel(option.kind)}</span>
                  <span className="rounded-full border px-2 py-1 font-medium">
                    {option.user_touched ? '手動調整済み' : '自動構成'}
                  </span>
                  {isConfirmedOption && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-1 font-semibold">
                      <CheckCircle2 aria-hidden="true" className="size-3.5" /> 確定案
                    </span>
                  )}
                  {isNotSelected && <span className="rounded-full border px-2 py-1 font-medium">未採用</span>}
                  {!previewMode && !slotIsConfirmed && isTop && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 font-semibold">
                      <Trophy aria-hidden="true" className="size-3.5" />
                      {tiedForTop ? '同率最多' : '最多票'}
                    </span>
                  )}
                  {!previewMode && isOwnVote && (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 font-semibold">
                      <Check aria-hidden="true" className="size-3.5" /> あなたの投票
                    </span>
                  )}
                </div>

                <h3 className="mt-3 font-semibold leading-snug">{option.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {option.kind === 'all_day' ? '終日予定' : formatTimeRange(option.start_at, option.end_at, timeZone)}
                </p>

                {metadata.length > 0 && (
                  <dl className="mt-3 space-y-1.5 text-sm">
                    {metadata.map((item) => (
                      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2" key={item.label}>
                        <dt className="text-muted-foreground">{item.label}</dt>
                        <dd className="min-w-0 break-words">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {option.reason && (
                  <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">配置理由：</span>
                    {option.reason}
                  </p>
                )}

                {option.note_id && (
                  <Link
                    className="mt-3 inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    to={`/trips/${tripId}/ideas#${encodeURIComponent(option.note_id)}`}
                  >
                    元の付箋を見る <ExternalLink aria-hidden="true" className="size-3.5" />
                  </Link>
                )}

                {previewMode ? (
                  <p className="mt-auto border-t pt-3 text-xs text-muted-foreground">この履歴には投票数が保存されていません。</p>
                ) : (
                  <div className="mt-auto border-t pt-3">
                    <p className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      <VoteIcon aria-hidden="true" className="size-4" /> {count}票
                    </p>
                    {slotIsConfirmed ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {isConfirmedOption ? 'この案が採用されています。' : '別の案が採用されています。'}
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button
                          aria-pressed={isOwnVote}
                          className="min-h-11 whitespace-normal"
                          disabled={Boolean(actionKey) || isOwnVote}
                          onClick={() => onVote(slot.id, option.id)}
                          type="button"
                          variant="outline"
                        >
                          {voteBusy ? (
                            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                          ) : isOwnVote ? (
                            <Check aria-hidden="true" className="size-4" />
                          ) : (
                            <VoteIcon aria-hidden="true" className="size-4" />
                          )}
                          {voteBusy ? '投票中' : isOwnVote ? '投票済み' : 'この案に投票'}
                        </Button>
                        {isTop && (
                          <Button
                            className="min-h-11 whitespace-normal"
                            disabled={Boolean(actionKey)}
                            onClick={() => onConfirm(slot.id, option.id)}
                            type="button"
                            variant="secondary"
                          >
                            {confirmBusy ? (
                              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                            ) : (
                              <Trophy aria-hidden="true" className="size-4" />
                            )}
                            {confirmBusy ? '確定中' : tiedForTop ? '同率最多からこの案を確定' : '最多票案を確定'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })
        )}
      </div>
    </li>
  )
}

type HistoryDrawerProps = {
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
      className="max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border bg-card shadow-lg xl:sticky xl:top-20"
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

function timestamp(value: string): number {
  const result = new Date(value).getTime()
  return Number.isNaN(result) ? Number.POSITIVE_INFINITY : result
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
