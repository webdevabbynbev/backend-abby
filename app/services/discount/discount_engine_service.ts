import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

import Discount from '#models/discount'
import DiscountTarget from '#models/discount_target'
import DiscountRedemption from '#models/discount_redemption'
import TransactionCart from '#models/transaction_cart'
import ProductVariant from '#models/product_variant'

type Channel = 'ecommerce' | 'pos'

type TrxLike = any

export class DiscountEngineService {
  private isScheduleValid(discount: Discount) {
    const now = DateTime.now().setZone('Asia/Jakarta')

    if (discount.startedAt && now < discount.startedAt) return false
    if (discount.expiredAt && now > discount.expiredAt) return false

    const mask = discount.daysOfWeekMask ?? 127
    // luxon weekday: Mon=1..Sun=7 => Sun bit=1, Mon=2, Tue=4, ...
    const bit = now.weekday === 7 ? 1 : 1 << now.weekday
    return (mask & bit) === bit
  }

  private computeDiscountAmount(discount: Discount, eligibleSubtotal: number) {
    if (eligibleSubtotal <= 0) return 0

    const valueType = Number(discount.valueType)
    const value = Number(discount.value || 0)
    const maxDiscount =
      discount.maxDiscount !== null && discount.maxDiscount !== undefined ? Number(discount.maxDiscount) : null

    // NOMINAL
    if (valueType === 2) {
      return Math.max(0, Math.min(value, eligibleSubtotal))
    }

    // PERCENTAGE
    const raw = (eligibleSubtotal * value) / 100
    const capped = maxDiscount !== null ? Math.min(raw, maxDiscount) : raw
    return Math.max(0, Math.min(capped, eligibleSubtotal))
  }

  private buildItems(carts: TransactionCart[]) {
    return carts
      .filter((c) => typeof c.productVariantId === 'number')
      .map((c) => {
        const qty = Number(c.qty || 0)
        const price = Number(c.price || 0)
        const disc = Number(c.discount || 0)

        return {
          variantId: c.productVariantId as number,
          qty,
          lineTotal: (price - disc) * qty,
        }
      })
  }

  private async computeEligibleSubtotal(discount: Discount, carts: TransactionCart[]) {
    const appliesTo = Number(discount.appliesTo)

    const items = this.buildItems(carts)
    const subTotal = items.reduce((a, b) => a + b.lineTotal, 0)

    // ALL_ORDERS
    if (appliesTo === 0) return { eligibleSubtotal: subTotal, subTotal }

    // MIN_ORDER
    if (appliesTo === 1) {
      const minAmount =
        discount.minOrderAmount !== null && discount.minOrderAmount !== undefined
          ? Number(discount.minOrderAmount)
          : null
      const minQty = discount.minOrderQty ?? null
      const totalQty = items.reduce((a, b) => a + b.qty, 0)

      if (minAmount !== null && subTotal < minAmount) {
        return { eligibleSubtotal: 0, subTotal, reason: 'MIN_ORDER' as const }
      }
      if (minQty !== null && totalQty < minQty) {
        return { eligibleSubtotal: 0, subTotal, reason: 'MIN_ORDER' as const }
      }
      return { eligibleSubtotal: subTotal, subTotal }
    }

    // COLLECTION (category_type) - optional/legacy
    if (appliesTo === 2) {
      const targets = await DiscountTarget.query().where('discount_id', discount.id).where('target_type', 1)

      const targetCategoryIds = new Set<number>(targets.map((t) => t.targetId))
      if (targetCategoryIds.size === 0) return { eligibleSubtotal: 0, subTotal, reason: 'NO_TARGETS' as const }

      const variantIds = items.map((i) => i.variantId)
      const variants = await ProductVariant.query().whereIn('id', variantIds).preload('product')

      const eligibleVariantIds = new Set<number>()
      for (const v of variants) {
        const catId = (v as any)?.product?.categoryTypeId
        if (typeof catId === 'number' && targetCategoryIds.has(catId)) {
          eligibleVariantIds.add(v.id)
        }
      }

      const eligibleSubtotal = items
        .filter((i) => eligibleVariantIds.has(i.variantId))
        .reduce((a, b) => a + b.lineTotal, 0)

      return { eligibleSubtotal, subTotal }
    }

    // BRAND
    if (appliesTo === 4) {
      const targets = await DiscountTarget.query().where('discount_id', discount.id).where('target_type', 3)

      const targetBrandIds = new Set<number>(targets.map((t) => t.targetId))
      if (targetBrandIds.size === 0) return { eligibleSubtotal: 0, subTotal, reason: 'NO_TARGETS' as const }

      const variantIds = items.map((i) => i.variantId)
      const variants = await ProductVariant.query().whereIn('id', variantIds).preload('product')

      const eligibleVariantIds = new Set<number>()
      for (const v of variants) {
        const brandId = (v as any)?.product?.brandId
        if (typeof brandId === 'number' && targetBrandIds.has(brandId)) {
          eligibleVariantIds.add(v.id)
        }
      }

      const eligibleSubtotal = items
        .filter((i) => eligibleVariantIds.has(i.variantId))
        .reduce((a, b) => a + b.lineTotal, 0)

      return { eligibleSubtotal, subTotal }
    }

    // PRODUCT
    if (appliesTo === 5) {
      const targets = await DiscountTarget.query().where('discount_id', discount.id).where('target_type', 4)

      const targetProductIds = new Set<number>(targets.map((t) => t.targetId))
      if (targetProductIds.size === 0) return { eligibleSubtotal: 0, subTotal, reason: 'NO_TARGETS' as const }

      const variantIds = items.map((i) => i.variantId)
      const variants = await ProductVariant.query().whereIn('id', variantIds)

      const eligibleVariantIds = new Set<number>()
      for (const v of variants) {
        if (typeof v.productId === 'number' && targetProductIds.has(v.productId)) {
          eligibleVariantIds.add(v.id)
        }
      }

      const eligibleSubtotal = items
        .filter((i) => eligibleVariantIds.has(i.variantId))
        .reduce((a, b) => a + b.lineTotal, 0)

      return { eligibleSubtotal, subTotal }
    }

    // VARIANT (NEW: attribute_values)
    if (appliesTo === 3) {
      // 1) NEW: target_type = 5 (attribute_value_id)
      const attrTargets = await DiscountTarget.query().where('discount_id', discount.id).where('target_type', 5)

      const targetAttrValueIds = new Set<number>(attrTargets.map((t) => t.targetId))

      if (targetAttrValueIds.size > 0) {
        const rows = await db
          .from('variant_attributes')
          .whereIn('attribute_value_id', Array.from(targetAttrValueIds))
          .select('product_variant_id')

        const eligibleVariantIds = new Set<number>(
          rows.map((r: any) => Number(r.product_variant_id)).filter((x: number) => Number.isFinite(x))
        )

        const eligibleSubtotal = items
          .filter((i) => eligibleVariantIds.has(i.variantId))
          .reduce((a, b) => a + b.lineTotal, 0)

        return { eligibleSubtotal, subTotal }
      }

      // 2) LEGACY fallback: target_type = 2 (product_variant_id)
      const legacyTargets = await DiscountTarget.query().where('discount_id', discount.id).where('target_type', 2)

      const targetVariantIds = new Set<number>(legacyTargets.map((t) => t.targetId))
      if (targetVariantIds.size === 0) return { eligibleSubtotal: 0, subTotal, reason: 'NO_TARGETS' as const }

      const eligibleSubtotal = items
        .filter((i) => targetVariantIds.has(i.variantId))
        .reduce((a, b) => a + b.lineTotal, 0)

      return { eligibleSubtotal, subTotal }
    }

    return { eligibleSubtotal: 0, subTotal, reason: 'UNKNOWN' as const }
  }

  /**
   * ✅ AUTO DISCOUNT: pilih diskon AUTO terbaik (discountAmount terbesar)
   * trx optional: biar bisa 1 transaksi dengan checkout
   */
  async findBestAutoDiscount(params: { userId: number; channel: Channel; carts: TransactionCart[]; trx?: TrxLike }) {
    const dateString = DateTime.now().setZone('Asia/Jakarta').toFormat('yyyy-LL-dd HH:mm:ss')

    const discounts = await Discount.query(params.trx ? { client: params.trx } : undefined)
      .whereNull('deleted_at')
      .where('is_active', 1 as any)
      .where('eligibility_type', 0 as any)
      .where('is_auto', 1 as any)
      .where((q) => q.whereNull('started_at').orWhere('started_at', '<=', dateString))
      .where((q) => q.whereNull('expired_at').orWhere('expired_at', '>=', dateString))
      .where(params.channel === 'ecommerce' ? 'is_ecommerce' : 'is_pos', 1 as any)
      .orderBy('id', 'desc')

    let best: { discount: Discount; eligibleSubtotal: number; discountAmount: number } | null = null

    for (const d of discounts) {
      if (!this.isScheduleValid(d)) continue

      if (d.usageLimit !== null) {
        const used = Number(d.usageCount || 0)
        const reserved = Number(d.reservedCount || 0)
        if (used + reserved >= d.usageLimit) continue
      }

      const appliesTo = Number(d.appliesTo || 0)

      // anti-stacking sederhana: kalau bukan ALL, hitung dari item yang belum ada diskon item-level
      const cartsForEligible = appliesTo === 0 ? params.carts : params.carts.filter((c) => Number(c.discount || 0) <= 0)

      const { eligibleSubtotal } = await this.computeEligibleSubtotal(d, cartsForEligible)
      if (eligibleSubtotal <= 0) continue

      const discountAmount = this.computeDiscountAmount(d, eligibleSubtotal)
      if (discountAmount <= 0) continue

      if (!best || discountAmount > best.discountAmount) {
        best = { discount: d, eligibleSubtotal, discountAmount }
      }
    }

    return best
  }

  // helper to avoid nested transaction
  private async runInTransaction(trxArg: any, fn: (trx: any) => Promise<any>) {
    if (trxArg) return fn(trxArg)
    return db.transaction(fn)
  }

  async reserve(params: {
    discountId: number
    code: string
    transactionId: number
    userId: number
    trx?: TrxLike
  }) {
    await this.runInTransaction(params.trx, async (trx) => {
      const d = await Discount.query({ client: trx }).where('id', params.discountId).forUpdate().firstOrFail()

      if (d.usageLimit !== null) {
        const used = Number(d.usageCount || 0)
        const reserved = Number(d.reservedCount || 0)
        if (used + reserved >= d.usageLimit) throw new Error('DISCOUNT_LIMIT_REACHED')
      }

      d.reservedCount = Number(d.reservedCount || 0) + 1
      await d.useTransaction(trx).save()

      await DiscountRedemption.create(
        {
          discountId: d.id,
          transactionId: params.transactionId,
          userId: params.userId,
          discountCode: params.code,
          status: 0,
          reservedAt: DateTime.now().setZone('Asia/Jakarta'),
        },
        { client: trx }
      )
    })
  }

  async markUsed(transactionId: number, trxArg?: TrxLike) {
    await this.runInTransaction(trxArg, async (trx) => {
      const redemption = await DiscountRedemption.query({ client: trx })
        .where('transaction_id', transactionId)
        .forUpdate()
        .first()

      if (!redemption || redemption.status !== 0) return

      const d = await Discount.query({ client: trx }).where('id', redemption.discountId).forUpdate().first()
      if (!d) return

      redemption.status = 1
      redemption.usedAt = DateTime.now().setZone('Asia/Jakarta')
      await redemption.save()

      d.reservedCount = Math.max(0, Number(d.reservedCount || 0) - 1)
      d.usageCount = Number(d.usageCount || 0) + 1
      await d.save()
    })
  }

  async cancelReserve(transactionId: number, trxArg?: TrxLike) {
    await this.runInTransaction(trxArg, async (trx) => {
      const redemption = await DiscountRedemption.query({ client: trx })
        .where('transaction_id', transactionId)
        .forUpdate()
        .first()

      if (!redemption || redemption.status !== 0) return

      const d = await Discount.query({ client: trx }).where('id', redemption.discountId).forUpdate().first()
      if (!d) return

      redemption.status = 2
      redemption.cancelledAt = DateTime.now().setZone('Asia/Jakarta')
      await redemption.save()

      d.reservedCount = Math.max(0, Number(d.reservedCount || 0) - 1)
      await d.save()
    })
  }
}