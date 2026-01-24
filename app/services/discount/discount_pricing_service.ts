import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

import Discount from '#models/discount'
import DiscountTarget from '#models/discount_target'

export type ExtraDiscountInfo = {
  discountId: number
  code: string
  label: string

  valueType: number // 1 percentage, 2 nominal
  value: number
  maxDiscount: number | null

  rulesByVariantId: Record<string, { valueType: number; value: number; maxDiscount: number | null }> | null

  appliesTo: number

  baseMinPrice: number
  baseMaxPrice: number

  eligibleMinPrice: number
  eligibleMaxPrice: number
  eligibleVariantCount: number | null
  eligibleVariantIds: number[] | null

  finalMinPrice: number
  finalMaxPrice: number

  minOrderAmount: number | null
  minOrderQty: number | null
}

type ProductLike = {
  id: number
  brandId?: number
  brand_id?: number
  categoryTypeId?: number
  category_type_id?: number
  basePrice?: number
  base_price?: number
  price?: number

  variants?: Array<{ id: number; price: any; deletedAt?: any; deleted_at?: any }>

  // output
  extraDiscount?: ExtraDiscountInfo | null
  [key: string]: any
}

type VariantRule = {
  valueType: number // 1 percent, 2 fixed
  value: number
  maxDiscount: number | null
}

type VariantEligibleRange = {
  min: number
  max: number
  variantIds: Set<number>

  variantPrices: Map<number, number>

  rules: Map<number, VariantRule>
}

type DiscountCtx = {
  discounts: Discount[]

  categoryTargets: Map<number, Set<number>>
  brandTargets: Map<number, Set<number>>
  productTargets: Map<number, Set<number>>

  variantEligibleRange: Map<number, Map<number, VariantEligibleRange>>

  blockedProductIds: Set<number>
}

type CacheValue = { exp: number; data: unknown }
class InMemoryCache {
  private store = new Map<string, CacheValue>()
  private inflight = new Map<string, Promise<unknown>>()

  get(key: string) {
    const it = this.store.get(key)
    if (!it) return null
    if (Date.now() > it.exp) {
      this.store.delete(key)
      return null
    }
    return it.data
  }

  set(key: string, data: unknown, ttlMs: number) {
    this.store.set(key, { exp: Date.now() + ttlMs, data })
  }

  async cachedFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>) {
    const cached = this.get(key)
    if (cached !== null) return cached as T

    const running = this.inflight.get(key)
    if (running) return (await running) as T

    const p: Promise<unknown> = (async () => {
      const data = await fetcher()
      this.set(key, data, ttlMs)
      return data
    })()

    this.inflight.set(key, p)
    try {
      return (await p) as T
    } finally {
      this.inflight.delete(key)
    }
  }
}

function toNumber(v: any, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function readProductBrandId(p: ProductLike) {
  return toNumber(p.brandId ?? p.brand_id ?? (p as any)?.brand?.id, 0) || null
}

function readProductCategoryId(p: ProductLike) {
  return toNumber(p.categoryTypeId ?? p.category_type_id ?? (p as any)?.categoryType?.id, 0) || null
}

function computeProductPriceRange(p: ProductLike): { min: number; max: number } {
  const variants = Array.isArray(p.variants) ? p.variants : []
  const prices = variants
    .filter((v) => !v?.deletedAt && !v?.deleted_at)
    .map((v) => toNumber(v?.price, NaN))
    .filter((x) => Number.isFinite(x) && x > 0)

  if (prices.length) {
    return { min: Math.min(...prices), max: Math.max(...prices) }
  }

  const fallback = toNumber(p.basePrice ?? p.base_price ?? p.price, 0) || 0
  return { min: fallback, max: fallback }
}

export class DiscountPricingService {
  private cache = new InMemoryCache()
  private TTL_MS = 60_000

  private nowWibStr(now: DateTime) {
    return now.setZone('Asia/Jakarta').toFormat('yyyy-LL-dd HH:mm:ss')
  }

  private isScheduleValid(discount: Discount, now: DateTime) {
    if (discount.startedAt && now < discount.startedAt) return false
    if (discount.expiredAt && now > discount.expiredAt) return false

    const mask = discount.daysOfWeekMask ?? 127
    const bit = now.weekday === 7 ? 1 : 1 << now.weekday
    return (mask & bit) === bit
  }

  private isUsageAvailable(discount: Discount) {
    if (discount.usageLimit === null) return true
    const used = toNumber(discount.usageCount, 0)
    const reserved = toNumber(discount.reservedCount, 0)
    return used + reserved < toNumber(discount.usageLimit, 0)
  }

  private computeDiscountAmountBy(valueType: number, value: number, maxDiscount: number | null, eligibleSubtotal: number) {
    if (eligibleSubtotal <= 0) return 0

    if (valueType === 2) {
      return Math.max(0, Math.min(value, eligibleSubtotal))
    }

    const raw = (eligibleSubtotal * value) / 100
    const capped = maxDiscount !== null ? Math.min(raw, maxDiscount) : raw
    return Math.max(0, Math.min(capped, eligibleSubtotal))
  }

  private computeDiscountAmount(discount: Discount, eligibleSubtotal: number) {
    const valueType = Number(discount.valueType)
    const value = Number(discount.value || 0)
    const maxDiscount =
      discount.maxDiscount !== null && discount.maxDiscount !== undefined ? Number(discount.maxDiscount) : null

    return this.computeDiscountAmountBy(valueType, value, maxDiscount, eligibleSubtotal)
  }

  // ✅ label public: tanpa kode (karena auto)
  private buildLabel(discount: Discount) {
    const valueType = Number(discount.valueType)
    const value = Number(discount.value || 0)
    if (valueType === 1) return `Diskon ${value}%`
    return `Diskon Rp${value}`
  }

  private buildLabelFromRules(rules: VariantRule[]) {
    if (!rules.length) return null

    const hasPercent = rules.some((r) => Number(r.valueType) === 1)
    if (hasPercent) {
      const maxPct = Math.max(...rules.filter((r) => Number(r.valueType) === 1).map((r) => toNumber(r.value, 0)))
      return `Diskon s/d ${maxPct}%`
    }

    const maxNom = Math.max(...rules.map((r) => toNumber(r.value, 0)))
    return `Diskon s/d Rp${maxNom}`
  }

  private async getCtx(now: DateTime): Promise<DiscountCtx> {
    return this.cache.cachedFetch('discount_pricing_ctx', this.TTL_MS, async () => {
      const schema = (db as any).connection().schema as any

      const hasDiscountsTable = await schema.hasTable('discounts')
      if (!hasDiscountsTable) {
        return {
          discounts: [],
          categoryTargets: new Map(),
          brandTargets: new Map(),
          productTargets: new Map(),
          variantEligibleRange: new Map(),
          blockedProductIds: new Set(),
        }
      }

      const nowStr = this.nowWibStr(now)

      // =========================
      // ✅ blockedProductIds = produk yang sedang promo Flash/Sale aktif (anti stacking)
      // =========================
      const blockedProductIds = new Set<number>()

      const hasFlashSales = await schema.hasTable('flash_sales')
      const hasFlashSaleProducts = await schema.hasTable('flashsale_products')
      if (hasFlashSales && hasFlashSaleProducts) {
        const rows = await db
          .from('flashsale_products as fsp')
          .join('flash_sales as fs', 'fs.id', 'fsp.flash_sale_id')
          .where('fs.is_publish', 1 as any)
          .where('fs.start_datetime', '<=', nowStr)
          .where('fs.end_datetime', '>=', nowStr)
          .select('fsp.product_id as product_id')

        for (const r of rows as any[]) {
          const pid = toNumber(r.product_id, 0)
          if (pid) blockedProductIds.add(pid)
        }
      }

      const hasSales = await schema.hasTable('sales')
      const hasSaleProducts = await schema.hasTable('sale_products')
      if (hasSales && hasSaleProducts) {
        const rows = await db
          .from('sale_products as sp')
          .join('sales as s', 's.id', 'sp.sale_id')
          .where('s.is_publish', 1 as any)
          .where('s.start_datetime', '<=', nowStr)
          .where('s.end_datetime', '>=', nowStr)
          .select('sp.product_id as product_id')

        for (const r of rows as any[]) {
          const pid = toNumber(r.product_id, 0)
          if (pid) blockedProductIds.add(pid)
        }
      }

      // =========================
      // discounts (aktif & ecommerce)
      // =========================
      const hasIsAutoColumn = await (async () => {
        try {
          const res: any = await db.rawQuery(
            `SELECT COUNT(*) AS total
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'discounts'
               AND COLUMN_NAME = 'is_auto'`
          )
          const rows = Array.isArray(res) ? res[0] : res?.rows ?? res
          return Number(rows?.[0]?.total ?? 0) > 0
        } catch {
          return false
        }
      })()

      let q = Discount.query()
        .whereNull('deleted_at')
        .where('is_active', 1 as any)
        .where('is_ecommerce', 1 as any)
        // sementara tampil publik cuma ALL (eligibility_type=0)
        .where('eligibility_type', 0 as any)
        .orderBy('id', 'desc')

      // ✅ hanya auto discount yg nempel tanpa input kode
      if (hasIsAutoColumn) {
        q = q.where((sub) => {
          sub.where('is_auto', 1 as any).orWhereNull('is_auto')
        })
      }

      const discounts = await q

      const active = discounts.filter((d) => this.isScheduleValid(d, now) && this.isUsageAvailable(d))
      const ids = active.map((d) => d.id)

      if (!ids.length) {
        return {
          discounts: [],
          categoryTargets: new Map(),
          brandTargets: new Map(),
          productTargets: new Map(),
          variantEligibleRange: new Map(),
          blockedProductIds,
        }
      }

      const hasDiscountTargetsTable = await schema.hasTable('discount_targets')
      const hasProductVariantsTable = await schema.hasTable('product_variants')
      const hasVariantAttributesTable = await schema.hasTable('variant_attributes')
      const hasDiscountVariantItemsTable = await schema.hasTable('discount_variant_items')

      const targets = hasDiscountTargetsTable ? await DiscountTarget.query().whereIn('discount_id', ids) : []

      const categoryTargets = new Map<number, Set<number>>()
      const brandTargets = new Map<number, Set<number>>()
      const productTargets = new Map<number, Set<number>>()

      for (const t of targets) {
        const did = toNumber((t as any).discountId, 0)
        const tid = toNumber((t as any).targetId, 0)
        const tt = toNumber((t as any).targetType, 0)
        if (!did || !tid) continue

        // 1 = category_type
        if (tt === 1) {
          if (!categoryTargets.has(did)) categoryTargets.set(did, new Set())
          categoryTargets.get(did)!.add(tid)
        }

        // 3 = brand_id
        if (tt === 3) {
          if (!brandTargets.has(did)) brandTargets.set(did, new Set())
          brandTargets.get(did)!.add(tid)
        }

        // 4 = product_id
        if (tt === 4) {
          if (!productTargets.has(did)) productTargets.set(did, new Set())
          productTargets.get(did)!.add(tid)
        }
      }

      const variantEligibleRange = new Map<number, Map<number, VariantEligibleRange>>()

      const addVariantEligibility = (
        discountId: number,
        productId: number,
        variantId: number,
        price: number,
        rule?: VariantRule
      ) => {
        if (!variantEligibleRange.has(discountId)) variantEligibleRange.set(discountId, new Map())
        const mp = variantEligibleRange.get(discountId)!

        const cur = mp.get(productId)
        if (!cur) {
          const init: VariantEligibleRange = {
            min: price,
            max: price,
            variantIds: new Set([variantId]),
            variantPrices: new Map([[variantId, price]]),
            rules: new Map(),
          }
          if (rule) init.rules.set(variantId, rule)
          mp.set(productId, init)
          return
        }

        cur.min = Math.min(cur.min, price)
        cur.max = Math.max(cur.max, price)
        cur.variantIds.add(variantId)
        cur.variantPrices.set(variantId, price)
        if (rule) cur.rules.set(variantId, rule)
      }

      // ============================================================
      // ✅ PRIORITASKAN discount_variant_items
      // Kalau discount sudah punya dvi aktif, JANGAN campur eligibility dari legacy discount_targets
      // (biar variant nonaktif benar-benar hilang & min/max eligible tidak tercampur).
      // ============================================================
      const discountIdsWithVariantItems = new Set<number>()

      const variantItemRows =
        hasDiscountVariantItemsTable && hasProductVariantsTable
          ? await db
              .from('discount_variant_items as dvi')
              .join('product_variants as pv', 'pv.id', 'dvi.product_variant_id')
              .whereIn('dvi.discount_id', ids)
              .where('dvi.is_active', 1 as any)
              .whereNull('pv.deleted_at')
              // kalau promo_stock diset, stok harus > 0 biar discount tampil
              .where((sub) => {
                sub.whereNull('dvi.promo_stock').orWhere('dvi.promo_stock', '>', 0 as any)
              })
              .select(
                'dvi.discount_id as discount_id',
                'pv.product_id as product_id',
                'pv.id as variant_id',
                'pv.price as price',
                'dvi.value_type as value_type',
                'dvi.value as value',
                'dvi.max_discount as max_discount'
              )
          : []

      for (const r of variantItemRows as any[]) {
        const did = toNumber(r.discount_id, 0)
        const pid = toNumber(r.product_id, 0)
        const vid = toNumber(r.variant_id, 0)
        const price = toNumber(r.price, NaN)
        if (!did || !pid || !vid || !Number.isFinite(price) || price <= 0) continue

        discountIdsWithVariantItems.add(did)

        const vt = String(r.value_type ?? '').toLowerCase().trim()
        const valueType = vt === 'fixed' ? 2 : 1
        const value = toNumber(r.value, 0)
        const maxDiscount = r.max_discount !== null && r.max_discount !== undefined ? toNumber(r.max_discount, 0) : null

        addVariantEligibility(did, pid, vid, price, { valueType, value, maxDiscount })
      }

      // ============================================================
      // Legacy targets hanya dipakai kalau discountId TIDAK punya dvi aktif
      // ============================================================

      // target_type = 2 (product_variants.id) legacy
      const legacyRows =
        hasDiscountTargetsTable && hasProductVariantsTable
          ? await db
              .from('discount_targets as dt')
              .join('product_variants as pv', 'pv.id', 'dt.target_id')
              .whereIn('dt.discount_id', ids)
              .where('dt.target_type', 2)
              .whereNull('pv.deleted_at')
              .select(
                'dt.discount_id as discount_id',
                'pv.product_id as product_id',
                'pv.id as variant_id',
                'pv.price as price'
              )
          : []

      for (const r of legacyRows as any[]) {
        const did = toNumber(r.discount_id, 0)
        if (discountIdsWithVariantItems.has(did)) continue

        const pid = toNumber(r.product_id, 0)
        const vid = toNumber(r.variant_id, 0)
        const price = toNumber(r.price, NaN)
        if (!did || !pid || !vid || !Number.isFinite(price) || price <= 0) continue

        addVariantEligibility(did, pid, vid, price)
      }

      // target_type = 5 (attribute_value_id via variant_attributes) legacy
      const attrRows =
        hasDiscountTargetsTable && hasVariantAttributesTable && hasProductVariantsTable
          ? await db
              .from('discount_targets as dt')
              .join('variant_attributes as va', 'va.attribute_value_id', 'dt.target_id')
              .join('product_variants as pv', 'pv.id', 'va.product_variant_id')
              .whereIn('dt.discount_id', ids)
              .where('dt.target_type', 5)
              .whereNull('va.deleted_at')
              .whereNull('pv.deleted_at')
              .select(
                'dt.discount_id as discount_id',
                'pv.product_id as product_id',
                'pv.id as variant_id',
                'pv.price as price'
              )
          : []

      for (const r of attrRows as any[]) {
        const did = toNumber(r.discount_id, 0)
        if (discountIdsWithVariantItems.has(did)) continue

        const pid = toNumber(r.product_id, 0)
        const vid = toNumber(r.variant_id, 0)
        const price = toNumber(r.price, NaN)
        if (!did || !pid || !vid || !Number.isFinite(price) || price <= 0) continue

        addVariantEligibility(did, pid, vid, price)
      }

      return { discounts: active, categoryTargets, brandTargets, productTargets, variantEligibleRange, blockedProductIds }
    })
  }

  public async attachExtraDiscount<T extends ProductLike>(products: T[], opts?: { now?: DateTime }): Promise<T[]> {
    const now = opts?.now ?? DateTime.now().setZone('Asia/Jakarta')
    const ctx = await this.getCtx(now)

    if (!ctx.discounts.length || !Array.isArray(products) || !products.length) return products

    for (const p of products) {
      p.extraDiscount = null

      const isBlockedByPromo = ctx.blockedProductIds.has(Number(p.id)) // FlashSale/Sale aktif

      const base = computeProductPriceRange(p)
      const brandId = readProductBrandId(p)
      const categoryId = readProductCategoryId(p)

      let best: ExtraDiscountInfo | null = null
      let bestSaving = 0

      for (const d of ctx.discounts) {
        const discountId = toNumber((d as any)?.id, 0)
        if (!discountId) continue
        const appliesTo = Number(d.appliesTo)

        // ✅ Anti-stacking: kalau produk lagi promo, skip semua extra discount
        // ✅ EXCEPTION: appliesTo=0 (storewide) tetap boleh nempel supaya semua produk tampil diskon.
        if (isBlockedByPromo && appliesTo !== 0) continue

        let eligibleMinPrice = base.min
        let eligibleMaxPrice = base.max
        let eligibleVariantCount: number | null = null
        let eligibleVariantIds: number[] | null = null

        let finalMinPrice = base.min
        let finalMaxPrice = base.max

        // representative value for badge
        let repValueType = Number(d.valueType)
        let repValue = Number(d.value || 0)
        let repMaxDiscount =
          d.maxDiscount !== null && d.maxDiscount !== undefined ? Number(d.maxDiscount) : null

        // label + rulesByVariantId (jangan mutate d)
        let label: string | null = null
        let rulesByVariantId: ExtraDiscountInfo['rulesByVariantId'] = null

        // 0 = all orders (secara display: semua produk bisa kelihatan diskon)
        if (appliesTo === 0) {
          const discOnMin = this.computeDiscountAmount(d, base.min)
          const discOnMax = this.computeDiscountAmount(d, base.max)
          finalMinPrice = Math.max(0, base.min - discOnMin)
          finalMaxPrice = Math.max(0, base.max - discOnMax)
          label = this.buildLabel(d)
        }

        // 1 = min order
        else if (appliesTo === 1) {
          const minAmount = d.minOrderAmount !== null && d.minOrderAmount !== undefined ? Number(d.minOrderAmount) : null
          const minQty = d.minOrderQty ?? null

          // listing (tanpa cart): filter yang jelas-jelas tidak mungkin, biar tidak misleading
          if (minAmount !== null && base.min < minAmount) continue
          if (minQty !== null && Number(minQty) > 1) continue

          const discOnMin = this.computeDiscountAmount(d, base.min)
          const discOnMax = this.computeDiscountAmount(d, base.max)
          finalMinPrice = Math.max(0, base.min - discOnMin)
          finalMaxPrice = Math.max(0, base.max - discOnMax)
          label = this.buildLabel(d)
        }

        // 2 = category/collection
        else if (appliesTo === 2) {
          const set = ctx.categoryTargets.get(discountId)
          if (!set || !categoryId || !set.has(categoryId)) continue

          const discOnMin = this.computeDiscountAmount(d, base.min)
          const discOnMax = this.computeDiscountAmount(d, base.max)
          finalMinPrice = Math.max(0, base.min - discOnMin)
          finalMaxPrice = Math.max(0, base.max - discOnMax)
          label = this.buildLabel(d)
        }

        // 3 = variant (eligible range dari variantEligibleRange)
        else if (appliesTo === 3) {
          const mp = ctx.variantEligibleRange.get(discountId)
          const row = mp ? mp.get(Number(p.id)) : null
          if (!row) continue

          eligibleMinPrice = row.min
          eligibleMaxPrice = row.max
          eligibleVariantCount = row.variantIds.size
          eligibleVariantIds = row.variantIds.size ? Array.from(row.variantIds) : null

          // mapping rulesByVariantId utk frontend (biar diskon beda per variant)
          if (row.rules.size) {
            const map: Record<string, VariantRule> = {}
            for (const [vid, rule] of row.rules.entries()) {
              map[String(vid)] = rule
            }
            rulesByVariantId = Object.keys(map).length ? map : null
          }

          // Hitung finalMin/finalMax dari semua variant eligible:
          let fMin = Infinity
          let fMax = -Infinity

          // representative rule (buat label/valueType/value)
          const rulesArr: VariantRule[] = row.rules.size ? Array.from(row.rules.values()) : []
          const labelFromRules = this.buildLabelFromRules(rulesArr)

          if (rulesArr.length) {
            // set representative numbers
            const hasPercent = rulesArr.some((r) => Number(r.valueType) === 1)
            if (hasPercent) {
              repValueType = 1
              repValue = Math.max(...rulesArr.filter((r) => Number(r.valueType) === 1).map((r) => toNumber(r.value, 0)))
              repMaxDiscount = null
            } else {
              repValueType = 2
              repValue = Math.max(...rulesArr.map((r) => toNumber(r.value, 0)))
              repMaxDiscount = null
            }
          }

          for (const vid of row.variantIds) {
            const price = row.variantPrices.get(vid)
            if (price === undefined) continue

            const rule = row.rules.get(vid)
            const discAmt = rule
              ? this.computeDiscountAmountBy(rule.valueType, rule.value, rule.maxDiscount, price)
              : this.computeDiscountAmount(d, price)

            const final = Math.max(0, price - discAmt)

            fMin = Math.min(fMin, final)
            fMax = Math.max(fMax, final)
          }

          if (!Number.isFinite(fMin) || !Number.isFinite(fMax)) continue

          finalMinPrice = fMin
          finalMaxPrice = fMax

          label = labelFromRules || this.buildLabel(d)
        }

        // 4 = brand
        else if (appliesTo === 4) {
          const set = ctx.brandTargets.get(discountId)
          if (!set || !brandId || !set.has(brandId)) continue

          const discOnMin = this.computeDiscountAmount(d, base.min)
          const discOnMax = this.computeDiscountAmount(d, base.max)
          finalMinPrice = Math.max(0, base.min - discOnMin)
          finalMaxPrice = Math.max(0, base.max - discOnMax)
          label = this.buildLabel(d)
        }

        // 5 = product
        else if (appliesTo === 5) {
          const set = ctx.productTargets.get(discountId)
          if (!set || !set.has(Number(p.id))) continue

          const discOnMin = this.computeDiscountAmount(d, base.min)
          const discOnMax = this.computeDiscountAmount(d, base.max)
          finalMinPrice = Math.max(0, base.min - discOnMin)
          finalMaxPrice = Math.max(0, base.max - discOnMax)
          label = this.buildLabel(d)
        } else {
          continue
        }

        const savingBase = appliesTo === 3 ? eligibleMinPrice : base.min
        const saving = Math.max(0, savingBase - finalMinPrice)


        if (saving > bestSaving) {
          bestSaving = saving
          best = {
            discountId,
            code: String((d as any).code || '').trim(),
            label: label || this.buildLabel(d),

            valueType: repValueType,
            value: repValue,
            maxDiscount: repMaxDiscount,

            rulesByVariantId,

            appliesTo,

            baseMinPrice: base.min,
            baseMaxPrice: base.max,

            eligibleMinPrice,
            eligibleMaxPrice,
            eligibleVariantCount,
            eligibleVariantIds,

            finalMinPrice,
            finalMaxPrice,

            minOrderAmount:
              d.minOrderAmount !== null && d.minOrderAmount !== undefined ? Number(d.minOrderAmount) : null,
            minOrderQty: (d as any).minOrderQty ?? null,
          }
        }
      }

      p.extraDiscount = best
    }

    return products
  }
}
