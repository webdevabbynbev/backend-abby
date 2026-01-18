export type CartListMode = 'list' | 'checkout'

export type CartListParams = {
  sortBy: string
  sortType: 'ASC' | 'DESC'
  isCheckout: 0 | 1 | null
  page: number
  perPage: number
  includeVariantAttributes: boolean
  mode: CartListMode
}

const SORT_FIELD_MAP: Record<string, string> = {
  created_at: 'created_at',
  updated_at: 'updated_at',
  qty: 'qty',
  amount: 'amount',
  price: 'price',
  discount: 'discount',
  id: 'id',

  // toleransi input camelCase/legacy
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

const SORT_DIR_MAP: Record<string, 'ASC' | 'DESC'> = {
  ASC: 'ASC',
  DESC: 'DESC',
  asc: 'ASC',
  desc: 'DESC',
}

function toInt(v: any, fallback: number) {
  const n = Number.parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function parseBoolish(v: any, defaultValue = false): boolean {
  if (v === undefined || v === null || v === '') return defaultValue
  if (typeof v === 'boolean') return v
  const s = String(v).trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  const n = Number(v)
  if (Number.isFinite(n)) return n !== 0
  return defaultValue
}

function parseIsCheckout(qs: any): 0 | 1 | null {
  const raw =
    typeof qs?.is_checkout !== 'undefined'
      ? qs.is_checkout
      : typeof qs?.isCheckout !== 'undefined'
        ? qs.isCheckout
        : null

  if (raw === null || raw === undefined || raw === '') return null

  const s = String(raw).toLowerCase()
  if (s === 'true' || s === '1') return 1
  if (s === 'false' || s === '0') return 0

  const n = Number(raw)
  if (Number.isFinite(n)) return n !== 0 ? 1 : 0

  return null
}

function parseMode(qs: any): CartListMode {
  const raw = String(qs?.mode || 'list').trim().toLowerCase()
  return raw === 'checkout' ? 'checkout' : 'list'
}

export function parseCartListParams(qs: any): CartListParams {
  const mode = parseMode(qs)

  const sortBy = SORT_FIELD_MAP[String(qs?.field || 'created_at')] || 'created_at'
  const sortType = SORT_DIR_MAP[String(qs?.value || 'DESC')] || 'DESC'

  const page = clamp(toInt(qs?.page, 1), 1, 1_000_000)
  const perPage = clamp(toInt(qs?.per_page ?? qs?.perPage, 10), 1, 100)

  const isCheckout = parseIsCheckout(qs)

  // ✅ mode checkout otomatis include attributes (compat untuk variant name dari attributes)
  const includeVariantAttributes =
    mode === 'checkout'
      ? true
      : parseBoolish(qs?.include_variant_attributes ?? qs?.includeVariantAttributes, false)

  return {
    sortBy,
    sortType,
    isCheckout,
    page,
    perPage,
    includeVariantAttributes,
    mode,
  }
}
