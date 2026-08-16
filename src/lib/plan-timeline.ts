import { clusterByOverlap, overlaps, type TimeSpan } from '@/lib/plan-conflicts'
import type { PlanOption, PlanSlot } from '@/types/domain'

export type SlotEntry = {
  slot: PlanSlot
  option: PlanOption
}

/** 同じ時間帯を争う案の集まり。slotをまたぐ場合もある。 */
export type TimelineGroup = {
  key: string
  entries: SlotEntry[]
  start: number
  end: number
}

export type RejectedOption = {
  option: PlanOption
  adoptedTitle: string
}

export type Timeline = {
  conflictRows: TimelineGroup[][]
  /** 採用済みの予定と、競合がなくそのまま反映される予定。 */
  confirmedRows: TimelineGroup[][]
  /** confirmedRowsのうち、投票を経ていない競合なしの予定。 */
  settledOptions: PlanOption[]
  rejectedOptions: RejectedOption[]
  /** 競合グループの通し番号。ラベルと色を日単位で一意にする。 */
  conflictNumbers: Map<string, number>
}

function toSpan(option: PlanOption): TimeSpan {
  return { start: timestamp(option.start_at), end: timestamp(option.end_at) }
}

export function timestamp(value: string): number {
  const result = new Date(value).getTime()
  return Number.isNaN(result) ? Number.POSITIVE_INFINITY : result
}

/** 実際の開始・終了時刻の重なりで競合グループを作る。slotが違っても重なる予定は同じグループになる。 */
export function buildOpenGroups(entries: SlotEntry[]): TimelineGroup[] {
  const clusters = clusterByOverlap(
    entries.map((entry) => ({
      entry,
      key: entry.slot.id,
      start: timestamp(entry.option.start_at),
      end: timestamp(entry.option.end_at),
      overlapExempt: entry.option.kind === 'all_day',
    })),
  )
  return clusters.map((cluster) => createGroup(cluster[0].entry.option.id, cluster.map((item) => item.entry)))
}

/** 帯の範囲は案の実時間で決める。slotの範囲まで含めると、隣の予定と重なって同じ行に並べられなくなる。 */
export function createGroup(key: string, entries: SlotEntry[]): TimelineGroup {
  const starts = entries.map((entry) => timestamp(entry.option.start_at))
  const ends = entries.map((entry) => timestamp(entry.option.end_at))
  return { key, entries, start: Math.min(...starts), end: Math.max(...ends) }
}

/** 時間が重ならないグループは同じ行にまとめ、行数（縦の長さ）を抑える。 */
export function packGroups(groups: TimelineGroup[]): TimelineGroup[][] {
  const rows: TimelineGroup[][] = []
  const sorted = [...groups].sort((left, right) => left.start - right.start)
  for (const group of sorted) {
    const row = rows.find((entries) =>
      entries.every((entry) => group.start >= entry.end || entry.start >= group.end),
    )
    if (row) row.push(group)
    else rows.push([group])
  }
  return rows
}

/** slotの持ち方に依存せず、実時間の重なりだけで競合・確定・不採用へ振り分ける。 */
export function buildTimeline(slots: PlanSlot[], optionsBySlot: Map<string, PlanOption[]>): Timeline {
  const openEntries: SlotEntry[] = []
  const confirmedGroups: TimelineGroup[] = []
  const rejectedOptions: RejectedOption[] = []

  for (const slot of slots) {
    const options = optionsBySlot.get(slot.id) ?? []
    if (slot.status === 'confirmed') {
      // 不採用案は確定行から外し、優先度が低いので最下段の行にまとめる。
      const adopted = options.filter((option) => option.id === slot.confirmed_option_id)
      const rejected = options.filter((option) => option.id !== slot.confirmed_option_id)
      const shown = adopted.length > 0 ? adopted : options
      confirmedGroups.push(createGroup(slot.id, shown.map((option) => ({ slot, option }))))
      if (adopted.length > 0) {
        for (const option of rejected) rejectedOptions.push({ option, adoptedTitle: adopted[0].title })
      }
      continue
    }
    openEntries.push(...options.map((option) => ({ slot, option })))
  }

  const confirmedEntries = confirmedGroups.flatMap((group) => group.entries)
  // 採用案と時間が重なったまま残る案は、slotが違っても競合なしではなく不採用として扱う。
  const remainingEntries: SlotEntry[] = []
  for (const entry of openEntries) {
    const adopted = confirmedEntries.find(
      (confirmed) =>
        entry.option.kind !== 'all_day' &&
        confirmed.option.kind !== 'all_day' &&
        confirmed.slot.confirmed_option_id === confirmed.option.id &&
        overlaps(toSpan(entry.option), toSpan(confirmed.option)),
    )
    if (adopted) {
      rejectedOptions.push({ option: entry.option, adoptedTitle: adopted.option.title })
    } else {
      remainingEntries.push(entry)
    }
  }

  const openGroups = buildOpenGroups(remainingEntries)
  const conflictGroups = openGroups.filter((group) => group.entries.length > 1)
  const settledGroups = openGroups.filter((group) => group.entries.length === 1)
  const settledOptions = settledGroups.map((group) => group.entries[0].option)
  // 競合していない予定は投票の必要がないので、確定した予定と同じ行に並べる。
  confirmedGroups.push(...settledGroups)
  rejectedOptions.sort((left, right) => timestamp(left.option.start_at) - timestamp(right.option.start_at))
  settledOptions.sort((left, right) => timestamp(left.start_at) - timestamp(right.start_at))

  return {
    conflictRows: packGroups(conflictGroups),
    confirmedRows: packGroups(confirmedGroups),
    settledOptions,
    rejectedOptions,
    conflictNumbers: new Map(
      [...conflictGroups]
        .sort((left, right) => left.start - right.start)
        .map((group, index) => [group.key, index] as const),
    ),
  }
}

export const COLUMNS_PER_HOUR = 4

/**
 * 予定をタイムラインのCSS Gridの列へ割り当てる。
 * 開始と終了を同じ丸め方にして、連続する予定が1列重なって下段へ送られないようにする。
 */
export function timelineGridColumn(
  option: Pick<PlanOption, 'kind' | 'start_at' | 'end_at'>,
  scale: { start: number; hourCount: number },
): string {
  const columns = scale.hourCount * COLUMNS_PER_HOUR
  if (option.kind === 'all_day') return `1 / span ${columns}`
  const columnDuration = (60 / COLUMNS_PER_HOUR) * 60 * 1000
  const optionStart = timestamp(option.start_at)
  const optionEnd = timestamp(option.end_at)
  if (!Number.isFinite(optionStart) || !Number.isFinite(optionEnd)) return `1 / span ${COLUMNS_PER_HOUR}`
  const startColumn = clamp(Math.round((optionStart - scale.start) / columnDuration), 0, columns - 1)
  const endColumn = clamp(Math.round((optionEnd - scale.start) / columnDuration), startColumn + 1, columns)
  return `${startColumn + 1} / span ${endColumn - startColumn}`
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

/** 同じ競合グループの別slotへ入れた自分の票を取り消すため、対象slotを求める。 */
export function supersededSlotIds(group: TimelineGroup, slotId: string): string[] {
  return [...new Set(group.entries.map((entry) => entry.slot.id).filter((id) => id !== slotId))]
}
