export function throwIfError(error: { message: string } | null): void {
  if (error) {
    throw error
  }
}

export function requireData<T>(data: T | null, message = 'Expected data was not returned'): T {
  if (data === null) {
    throw new Error(message)
  }
  return data
}
