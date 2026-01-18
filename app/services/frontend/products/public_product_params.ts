import { DateTime } from 'luxon'

// whitelist untuk mencegah SQL injection via orderByRaw
export const SORT_FIELD_MAP: Record<string, string> = {
  position: 'position',
  popularity: 'popularity',
  created_at: 'created_at',
  updated_at: 'updated_at',
  name: 'name',
  base_price: 'base_price',
  // toleransi input camelCase dari client lama
  basePrice: 'base_price',
}

export const SORT_DIR_MAP: Record<string, 'ASC' | 'DESC'> = {
  ASC: 'ASC',
  DESC: 'DESC',
  asc: 'ASC',
  desc: 'DESC',
}

export function nowWibSqlString() {
  return DateTime.now().setZone('Asia/Jakarta').toFormat('yyyy-LL-dd HH:mm:ss')
}

export function toInt(v: any, fallback: number) {
  const n = Number.parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function parseCsvIds(v: any): Array<number | string> {
  if (v === undefined || v === null || v === '') return []
  const raw = typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v : [v]
  return raw
    .map((x) => {
      const n = Number(x)
      // kalau ternyata bukan angka (legacy), biarkan string-nya; Lucid whereIn akan handle
      return Number.isFinite(n) ? n : String(x)
    })
    .filter((x) => x !== '' && x !== null && x !== undefined)
}

export function parseBoolishToInt(v: any): 0 | 1 | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'boolean') return v ? 1 : 0
  const s = String(v).toLowerCase()
  if (s === 'true' || s === '1') return 1
  if (s === 'false' || s === '0') return 0
  const n = Number(v)
  if (Number.isFinite(n)) return n !== 0 ? 1 : 0
  return null
}

// buat flag query param seperti include_reviews=1 / true
export function parseBoolish(v: any, defaultValue = false): boolean {
  if (v === undefined || v === null || v === '') return defaultValue
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  const n = Number(v)
  if (Number.isFinite(n)) return n !== 0
  return defaultValue
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

export function normalizeWildcardPath(rawPath: any): string {
  const joined = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '')
  return safeDecode(joined).trim()
}
