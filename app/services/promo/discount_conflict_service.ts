import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Discount from '#models/discount'

export type DiscountConflictResult = { productIds: number[]; discountIds: number[] }


export class DiscountConflictService {
  private readonly zone = 'Asia/Jakarta'

  private toNumber(v: any, fallback = 0) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  private uniqPositiveInts(arr: any[]): number[] {
    return Array.from(
      new Set((arr ?? []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))
    )
  }

  private weekdayBit(dt: DateTime) {
    // Luxon: weekday 1=Mon ... 7=Sun
    return dt.weekday === 7 ? 1 : 1 << dt.weekday
  }

  private doesDiscountOverlapPromo(discount: Discount, promoStart: DateTime, promoEnd: DateTime) {
    // Treat null start/end as open interval
    const dStart = discount.startedAt
      ? discount.startedAt.setZone(this.zone)
      : DateTime.fromMillis(0).setZone(this.zone)

    const dEnd = discount.expiredAt
      ? discount.expiredAt.setZone(this.zone)
      : DateTime.fromISO('9999-12-31T23:59:59', { zone: this.zone })

    const start = promoStart > dStart ? promoStart : dStart
    const end = promoEnd < dEnd ? promoEnd : dEnd
    if (start > end) return false

    const mask = Number(discount.daysOfWeekMask ?? 127) || 127

    const startDay = start.startOf('day')
    const endDay = end.startOf('day')
    const diffDays = Math.floor(endDay.diff(startDay, 'days').days)

    // Any consecutive 7 days will contain all weekdays.
    if (diffDays >= 6) return mask !== 0

    for (let i = 0; i <= diffDays; i++) {
      const day = startDay.plus({ days: i })
      const bit = this.weekdayBit(day)
      if ((mask & bit) === bit) return true
    }

    return false
  }

  private isUsageAvailable(discount: Discount) {
    if (discount.usageLimit === null) return true
    const used = this.toNumber(discount.usageCount, 0)
    const reserved = this.toNumber(discount.reservedCount, 0)
    return used + reserved < this.toNumber(discount.usageLimit, 0)
  }

  public async findDiscountConflictsForProducts(
    trx: any,
    productIds: number[],
    promoStart: DateTime,
    promoEnd: DateTime
  ): Promise<DiscountConflictResult> {
    const ids = this.uniqPositiveInts(productIds)
    if (!ids.length) return { productIds: [], discountIds: [] }

    const schema = (db as any).connection().schema as any
    const hasDiscountTargets = await schema.hasTable('discount_targets')
    if (!hasDiscountTargets) return { productIds: [], discountIds: [] }

    // Pull candidate auto discounts (only those that target products/brand/category/variant)
    const discounts = await Discount.query({ client: trx })
      .whereNull('deleted_at')
      .where('is_active', 1 as any)
      .where('is_ecommerce', 1 as any)
      .where('eligibility_type', 0 as any)
      .where('is_auto', 1 as any)
      .whereIn('applies_to', [2, 3, 4, 5])
      .orderBy('id', 'desc')

    const promoStartWib = promoStart.setZone(this.zone)
    const promoEndWib = promoEnd.setZone(this.zone)

    const activeIds = discounts
      .filter((d) => this.isUsageAvailable(d) && this.doesDiscountOverlapPromo(d, promoStartWib, promoEndWib))
      .map((d) => Number(d.id))
      .filter((x) => Number.isFinite(x) && x > 0)

    if (!activeIds.length) return { productIds: [], discountIds: [] }

    const discounted = new Set<number>()
    const hitDiscountIds = new Set<number>()

    const addHit = (productId: any, discountId: any) => {
      const pid = this.toNumber(productId, 0)
      const did = this.toNumber(discountId, 0)
      if (pid) discounted.add(pid)
      if (did) hitDiscountIds.add(did)
    }

    // 4 = product_id
    const rowsProduct = await trx
      .from('discount_targets as dt')
      .whereIn('dt.discount_id', activeIds)
      .where('dt.target_type', 4)
      .whereIn('dt.target_id', ids)
      .select('dt.discount_id as discount_id', 'dt.target_id as product_id')
    for (const r of rowsProduct as any[]) addHit(r.product_id, r.discount_id)

    // 1 = category_type_id
    const rowsCategory = await trx
      .from('discount_targets as dt')
      .join('products as p', 'p.category_type_id', 'dt.target_id')
      .whereIn('dt.discount_id', activeIds)
      .where('dt.target_type', 1)
      .whereIn('p.id', ids)
      .whereNull('p.deleted_at')
      .select('dt.discount_id as discount_id', 'p.id as product_id')
    for (const r of rowsCategory as any[]) addHit(r.product_id, r.discount_id)

    // 3 = brand_id
    const rowsBrand = await trx
      .from('discount_targets as dt')
      .join('products as p', 'p.brand_id', 'dt.target_id')
      .whereIn('dt.discount_id', activeIds)
      .where('dt.target_type', 3)
      .whereIn('p.id', ids)
      .whereNull('p.deleted_at')
      .select('dt.discount_id as discount_id', 'p.id as product_id')
    for (const r of rowsBrand as any[]) addHit(r.product_id, r.discount_id)

    // 2 = product_variants.id (legacy)
    const hasProductVariants = await schema.hasTable('product_variants')
    if (hasProductVariants) {
      const rowsLegacyVariant = await trx
        .from('discount_targets as dt')
        .join('product_variants as pv', 'pv.id', 'dt.target_id')
        .whereIn('dt.discount_id', activeIds)
        .where('dt.target_type', 2)
        .whereIn('pv.product_id', ids)
        .whereNull('pv.deleted_at')
        .select('dt.discount_id as discount_id', 'pv.product_id as product_id')
      for (const r of rowsLegacyVariant as any[]) addHit(r.product_id, r.discount_id)
    }

    // 5 = attribute_value_id (via variant_attributes)
    const hasVariantAttributes = await schema.hasTable('variant_attributes')
    if (hasVariantAttributes && hasProductVariants) {
      const rowsAttrVariant = await trx
        .from('discount_targets as dt')
        .join('variant_attributes as va', 'va.attribute_value_id', 'dt.target_id')
        .join('product_variants as pv', 'pv.id', 'va.product_variant_id')
        .whereIn('dt.discount_id', activeIds)
        .where('dt.target_type', 5)
        .whereIn('pv.product_id', ids)
        .whereNull('va.deleted_at')
        .whereNull('pv.deleted_at')
        .select('dt.discount_id as discount_id', 'pv.product_id as product_id')
      for (const r of rowsAttrVariant as any[]) addHit(r.product_id, r.discount_id)
    }

    return {
      productIds: Array.from(discounted),
      discountIds: Array.from(hitDiscountIds),
    }
  }
}
