// Deno runtime向けに外部importを持たない純粋関数として保持する。
// Frontend側の表示用grouping は src/lib/plan-conflicts.ts にある。

export type PlanOptionInput = {
  start_at: string
  end_at: string
  kind?: string
}

export type PlanSlotInput<Option extends PlanOptionInput> = {
  start_at: string
  end_at: string
  options: Option[]
}

export type MergedSlot<Option extends PlanOptionInput> = {
  start_at: string
  end_at: string
  options: Option[]
}

/** 時間が重なる案を1つのslotへまとめ、投票で1案を選べる競合候補として保存する。 */
export function mergeOverlappingSlots<Option extends PlanOptionInput, Slot extends PlanSlotInput<Option>>(
  slots: Slot[],
): MergedSlot<Option>[] {
  const entries = slots.flatMap((slot, slotIndex) =>
    slot.options.map((option) => ({
      option,
      slotIndex,
      start: Date.parse(option.start_at),
      end: Date.parse(option.end_at),
      exempt: option.kind === 'all_day',
    })),
  )

  const parents = entries.map((_, index) => index)
  const findRoot = (index: number): number => {
    let root = index
    while (parents[root] !== root) root = parents[root]
    return root
  }
  const merge = (left: number, right: number) => {
    const leftRoot = findRoot(left)
    const rightRoot = findRoot(right)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }

  for (let index = 0; index < entries.length; index += 1) {
    for (let other = index + 1; other < entries.length; other += 1) {
      const left = entries[index]
      const right = entries[other]
      const comparable =
        !left.exempt &&
        !right.exempt &&
        Number.isFinite(left.start) &&
        Number.isFinite(left.end) &&
        Number.isFinite(right.start) &&
        Number.isFinite(right.end)
      const timesOverlap = comparable && left.start < right.end && left.end > right.start
      if (left.slotIndex === right.slotIndex || timesOverlap) merge(index, other)
    }
  }

  const clusters = new Map<number, typeof entries>()
  for (let index = 0; index < entries.length; index += 1) {
    const root = findRoot(index)
    const cluster = clusters.get(root) ?? []
    cluster.push(entries[index])
    clusters.set(root, cluster)
  }

  return [...clusters.values()]
    .map((cluster) => [...cluster].sort((left, right) => left.start - right.start || left.end - right.end))
    .sort((left, right) => left[0].start - right[0].start)
    .map((cluster) => ({
      start_at: cluster.reduce(
        (earliest, entry) => (entry.start < Date.parse(earliest) ? entry.option.start_at : earliest),
        cluster[0].option.start_at,
      ),
      end_at: cluster.reduce(
        (latest, entry) => (entry.end > Date.parse(latest) ? entry.option.end_at : latest),
        cluster[0].option.end_at,
      ),
      options: cluster.map((entry) => entry.option),
    }))
}
