export type TimeSpan = {
  start: number
  end: number
}

export type ClusterItem = TimeSpan & {
  /** 同じkeyの要素は、時間が重なっていなくても同じグループへまとめる。 */
  key: string
  /** 終日予定のように時間帯の比較になじまない要素を、重複判定から外す。 */
  overlapExempt?: boolean
}

/** 終了時刻と次の開始時刻が同一の場合は重複として扱わない。 */
export function overlaps(left: TimeSpan, right: TimeSpan): boolean {
  return left.start < right.end && left.end > right.start
}

/** 時間が重なる要素を同じグループへまとめる。重複が連鎖する場合も1つのグループになる。 */
export function clusterByOverlap<T extends ClusterItem>(items: T[]): T[][] {
  const parents = items.map((_, index) => index)

  const findRoot = (index: number): number => {
    let root = index
    while (parents[root] !== root) root = parents[root]
    let current = index
    while (parents[current] !== root) {
      const next = parents[current]
      parents[current] = root
      current = next
    }
    return root
  }

  const merge = (left: number, right: number) => {
    const leftRoot = findRoot(left)
    const rightRoot = findRoot(right)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }

  for (let index = 0; index < items.length; index += 1) {
    for (let other = index + 1; other < items.length; other += 1) {
      const sameKey = items[index].key === items[other].key
      const comparable = !items[index].overlapExempt && !items[other].overlapExempt
      if (sameKey || (comparable && overlaps(items[index], items[other]))) merge(index, other)
    }
  }

  const clusters = new Map<number, T[]>()
  for (let index = 0; index < items.length; index += 1) {
    const root = findRoot(index)
    const cluster = clusters.get(root) ?? []
    cluster.push(items[index])
    clusters.set(root, cluster)
  }

  return [...clusters.values()]
    .map((cluster) => [...cluster].sort((left, right) => left.start - right.start || left.end - right.end))
    .sort((left, right) => left[0].start - right[0].start)
}
