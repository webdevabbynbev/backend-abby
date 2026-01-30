export const isUserActive = (value: unknown): boolean => {
  // Only accept explicit active values
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value === 1 // Only accept 1 as active
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    // Only accept explicit active strings
    return ['1', 'true', 'active', 'yes'].includes(normalized)
  }

  return false
}