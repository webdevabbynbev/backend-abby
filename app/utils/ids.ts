export function uniqPositiveInts(arr: any[]): number[] {
  return Array.from(
    new Set((arr ?? []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))
  )
}
