import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Discount from '#models/discount'

export function toInt(v: any, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function toStr(v: any, fallback = '') {
  const s = String(v ?? '').trim()
  return s ? s : fallback
}

export function toNum(v: any, fallback: number | null = null): number | null {
  if (v === undefined || v === null) return fallback
  const s = String(v).trim()
  if (!s) return fallback
  const normalized = s.replace(/\./g, '').replace(/,/g, '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : fallback
}

export function pick(obj: any, ...keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k]
    if (v !== undefined) return v
  }
  return undefined
}

export function uniqNums(arr: any[]): number[] {
  const nums: number[] = (arr ?? []).map((x) => Number(x))
  return Array.from(new Set(nums.filter((x: number) => Number.isFinite(x))))
}

export function buildMaskFromDays(days: any[]): number {
  const ds = uniqNums(days)
  let mask = 0
  for (const d of ds) {
    if (d === 0) mask |= 1
    else mask |= 1 << d
  }
  return mask || 127
}

export function daysFromMask(mask: number): number[] {
  const out: number[] = []
  const m = Number(mask || 127)
  for (let d = 0; d <= 6; d++) {
    const bit = d === 0 ? 1 : 1 << d
    if ((m & bit) === bit) out.push(d)
  }
  return out
}

export function parseStartDate(dateStr: any): DateTime | null {
  const s = String(dateStr ?? '').trim()
  if (!s) return null
  const dt = DateTime.fromISO(s, { zone: 'Asia/Jakarta' })
  return dt.isValid ? dt.startOf('day') : null
}

export function parseEndDate(dateStr: any): DateTime | null {
  const s = String(dateStr ?? '').trim()
  if (!s) return null
  const dt = DateTime.fromISO(s, { zone: 'Asia/Jakarta' })
  return dt.isValid ? dt.endOf('day') : null
}

export function normalizeIdentifier(raw: any): { id: number | null; code: string | null } {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { id: null, code: null }
  const idNum = Number(trimmed)
  if (Number.isFinite(idNum) && idNum > 0) return { id: idNum, code: null }
  return { id: null, code: trimmed }
}

export async function findDiscountByIdentifier(identifier: { id: number | null; code: string | null }, trx?: any) {
  if (identifier.id) {
    return Discount.query({ client: trx }).where('id', identifier.id).whereNull('deleted_at').first()
  }
  if (identifier.code) {
    return Discount.query({ client: trx }).where('code', identifier.code).whereNull('deleted_at').first()
  }
  return null
}

export function toIsActive(v: any, fallback = true) {
  if (v === undefined) return fallback
  return toInt(v, fallback ? 1 : 2) === 1
}

function nowWibStr(now: DateTime) {
  return now.setZone('Asia/Jakarta').toFormat('yyyy-LL-dd HH:mm:ss')
}

export async function getActivePromoProductIds(trx: any, productIds: number[]) {
  const schema = (db as any).connection().schema as any
  const now = DateTime.now().setZone('Asia/Jakarta')
  const nowStr = nowWibStr(now)

  const flash: number[] = []
  const sale: number[] = []

  const hasFlashSales = await schema.hasTable('flash_sales')
  const hasFlashSaleProducts = await schema.hasTable('flashsale_products')
  if (hasFlashSales && hasFlashSaleProducts && productIds.length) {
    const flashIdsRows = await trx
      .from('flash_sales')
      .where('is_publish', 1 as any)
      .where('start_datetime', '<=', nowStr)
      .where('end_datetime', '>=', nowStr)
      .select('id')

    const flashNums: number[] = (flashIdsRows ?? []).map((r: any) => Number(r.id))
    const flashIds = flashNums.filter((x: number) => Number.isFinite(x) && x > 0)

    if (flashIds.length) {
      const rows = await trx
        .from('flashsale_products')
        .whereIn('flash_sale_id', flashIds)
        .whereIn('product_id', productIds)
        .select('product_id')

      for (const r of rows as any[]) {
        const pid = Number(r.product_id)
        if (Number.isFinite(pid) && pid > 0) flash.push(pid)
      }
    }
  }

  const hasSales = await schema.hasTable('sales')
  const hasSaleProducts = await schema.hasTable('sale_products')
  if (hasSales && hasSaleProducts && productIds.length) {
    const saleIdsRows = await trx
      .from('sales')
      .where('is_publish', 1 as any)
      .where('start_datetime', '<=', nowStr)
      .where('end_datetime', '>=', nowStr)
      .select('id')

    const saleNums: number[] = (saleIdsRows ?? []).map((r: any) => Number(r.id))
    const saleIds = saleNums.filter((x: number) => Number.isFinite(x) && x > 0)

    if (saleIds.length) {
      const rows = await trx
        .from('sale_products')
        .whereIn('sale_id', saleIds)
        .whereIn('product_id', productIds)
        .select('product_id')

      for (const r of rows as any[]) {
        const pid = Number(r.product_id)
        if (Number.isFinite(pid) && pid > 0) sale.push(pid)
      }
    }
  }

  return { flash: Array.from(new Set(flash)), sale: Array.from(new Set(sale)) }
}

export async function transferOutFromActivePromos(trx: any, productIds: number[]) {
  const schema = (db as any).connection().schema as any
  const now = DateTime.now().setZone('Asia/Jakarta')
  const nowStr = nowWibStr(now)

  const hasFlashSales = await schema.hasTable('flash_sales')
  const hasFlashSaleProducts = await schema.hasTable('flashsale_products')
  if (hasFlashSales && hasFlashSaleProducts && productIds.length) {
    const flashIdsRows = await trx
      .from('flash_sales')
      .where('is_publish', 1 as any)
      .where('start_datetime', '<=', nowStr)
      .where('end_datetime', '>=', nowStr)
      .select('id')

    const flashNums: number[] = (flashIdsRows ?? []).map((r: any) => Number(r.id))
    const flashIds = flashNums.filter((x: number) => Number.isFinite(x) && x > 0)

    if (flashIds.length) {
      await trx.from('flashsale_products').whereIn('flash_sale_id', flashIds).whereIn('product_id', productIds).delete()
    }
  }

  const hasSales = await schema.hasTable('sales')
  const hasSaleProducts = await schema.hasTable('sale_products')
  if (hasSales && hasSaleProducts && productIds.length) {
    const saleIdsRows = await trx
      .from('sales')
      .where('is_publish', 1 as any)
      .where('start_datetime', '<=', nowStr)
      .where('end_datetime', '>=', nowStr)
      .select('id')

    const saleNums: number[] = (saleIdsRows ?? []).map((r: any) => Number(r.id))
    const saleIds = saleNums.filter((x: number) => Number.isFinite(x) && x > 0)

    if (saleIds.length) {
      await trx.from('sale_products').whereIn('sale_id', saleIds).whereIn('product_id', productIds).delete()
    }
  }
}

export async function buildTargetProductIdsForConflict(trx: any, payload: any, appliesTo: number): Promise<number[]> {
  if (appliesTo === 0 || appliesTo === 1) return []

  if (appliesTo === 2) {
    const ids = uniqNums(pick(payload, 'category_type_ids', 'categoryTypeIds') ?? [])
    if (!ids.length) return []
    const rows = await trx.from('products').whereIn('category_type_id', ids).select('id')
    const nums: number[] = (rows ?? []).map((r: any) => Number(r.id))
    return Array.from(new Set(nums.filter((x: number) => Number.isFinite(x) && x > 0)))
  }

  if (appliesTo === 3) {
    const ids = uniqNums(pick(payload, 'variant_ids', 'variantIds') ?? [])
    if (!ids.length) return []

    const schema = (db as any).connection().schema as any
    const hasVariantAttributes = await schema.hasTable('variant_attributes')
    const hasProductVariants = await schema.hasTable('product_variants')

    if (hasVariantAttributes && hasProductVariants) {
      const rows = await trx
        .from('variant_attributes as va')
        .join('product_variants as pv', 'pv.id', 'va.product_variant_id')
        .whereIn('va.attribute_value_id', ids)
        .whereNull('va.deleted_at')
        .whereNull('pv.deleted_at')
        .select('pv.product_id')

      const nums: number[] = (rows ?? []).map((r: any) => Number(r.product_id))
      return Array.from(new Set(nums.filter((x: number) => Number.isFinite(x) && x > 0)))
    }

    const rows = await trx.from('product_variants').whereIn('id', ids).select('product_id')
    const nums2: number[] = (rows ?? []).map((r: any) => Number(r.product_id))
    return Array.from(new Set(nums2.filter((x: number) => Number.isFinite(x) && x > 0)))
  }

  if (appliesTo === 4) {
    const ids = uniqNums(pick(payload, 'brand_ids', 'brandIds') ?? [])
    if (!ids.length) return []
    const rows = await trx.from('products').whereIn('brand_id', ids).select('id')
    const nums: number[] = (rows ?? []).map((r: any) => Number(r.id))
    return Array.from(new Set(nums.filter((x: number) => Number.isFinite(x) && x > 0)))
  }

  if (appliesTo === 5) {
    const ids = uniqNums(pick(payload, 'product_ids', 'productIds') ?? [])
    return ids.filter((x: number) => Number.isFinite(x) && x > 0)
  }

  return []
}
