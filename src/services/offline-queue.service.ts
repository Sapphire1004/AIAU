const databaseName = 'aiau-offline'
const storeName = 'mutations'
const databaseVersion = 1

export type OfflineMutation = {
  id: string
  entityType: 'personal_event'
  entityId: string
  baseRevision: number
  payload: Record<string, unknown>
  createdAt: string
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: 'id' })
        store.createIndex('entityId', 'entityId')
        store.createIndex('createdAt', 'createdAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function queueOfflineMutation(
  mutation: Omit<OfflineMutation, 'id' | 'createdAt'>,
): Promise<OfflineMutation> {
  const record: OfflineMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  await transact('readwrite', (store) => store.add(record))
  return record
}

export async function listOfflineMutations(): Promise<OfflineMutation[]> {
  const records = await transact('readonly', (store) => store.getAll())
  return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function removeOfflineMutation(id: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(id))
}

export async function flushOfflineMutations(
  apply: (mutation: OfflineMutation) => Promise<'applied' | 'conflict'>,
): Promise<{ applied: number; conflicts: number }> {
  const records = await listOfflineMutations()
  const blockedEntities = new Set<string>()
  let applied = 0
  let conflicts = 0

  for (const record of records) {
    if (blockedEntities.has(record.entityId)) {
      continue
    }
    const result = await apply(record)
    if (result === 'conflict') {
      blockedEntities.add(record.entityId)
      conflicts += 1
      continue
    }
    await removeOfflineMutation(record.id)
    applied += 1
  }

  return { applied, conflicts }
}
