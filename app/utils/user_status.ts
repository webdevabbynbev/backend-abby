export const isUserActive = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    if (['0', 'false', 'f', 'no', 'n'].includes(normalized)) return false
    return true
  }

  return Boolean(value)
}