import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type VariantPromoKind = 'flash' | 'sale'

export type VariantPromoHit = {
  kind: VariantPromoKind
  promoId: number
  variantId: number
  price: number
  stock: number
  startDatetime?: string | null
  endDatetime?: string | null
}

export class PromoVariantPricingService {
  private zone = 'Asia/Jakarta'

  private nowWibStr(now: DateTime) {
    return now.setZone(this.zone).toFormat('yyyy-LL-dd HH:mm:ss')
  }

  private uniqPositiveInts(arr: any[]): number[] {
    return Array.from(
      new Set((arr ?? []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))
    )
  }

  public async resolveActivePromosForVariantIds(
    variantIds: number[],
    opts?: { trx?: TransactionClientContract; now?: DateTime; includeZeroStock?: boolean }
  ): Promise<Record<number, VariantPromoHit>> {
    const ids = this.uniqPositiveInts(variantIds)
    if (!ids.length) return {}

    const now = opts?.now ?? DateTime.now()
    const nowStr = this.nowWibStr(now)
    const client: any = opts?.trx ?? db

    // buat aman kalau table belum ada di env tertentu
    const schema = (db as any).connection().schema as any
    const hasFlashVariantTable = await schema.hasTable('flashsale_variants')
    const hasSaleVariantTable = await schema.hasTable('sale_variants')
    const hasSalesTable = await schema.hasTable('sales')

    const result: Record<number, VariantPromoHit> = {}

    // ---------- FLASH ----------
    if (hasFlashVariantTable) {
      const flashRows = await client
        .from('flashsale_variants as fsv')
        .join('flash_sales as fs', 'fs.id', 'fsv.flash_sale_id')
        .where('fs.is_publish', 1)
        .where('fs.start_datetime', '<=', nowStr)
        .where('fs.end_datetime', '>=', nowStr)
        .whereIn('fsv.product_variant_id', ids)
        .select([
          'fsv.product_variant_id as variantId',
          'fsv.flash_price as price',
          'fsv.stock as stock',
          'fs.id as promoId',
          'fs.start_datetime as startDatetime',
          'fs.end_datetime as endDatetime',
        ])

      // pick best per variant
      const bestFlash = this.pickBestPerVariant(flashRows, 'flash', opts?.includeZeroStock ?? false)
      for (const hit of bestFlash) result[hit.variantId] = hit
    }

    // ---------- SALE ----------
    if (hasSalesTable && hasSaleVariantTable) {
      const saleRows = await client
        .from('sale_variants as sv')
        .join('sales as s', 's.id', 'sv.sale_id')
        .where('s.is_publish', 1)
        .where('s.start_datetime', '<=', nowStr)
        .where('s.end_datetime', '>=', nowStr)
        .whereIn('sv.product_variant_id', ids)
        .select([
          'sv.product_variant_id as variantId',
          'sv.sale_price as price',
          'sv.stock as stock',
          's.id as promoId',
          's.start_datetime as startDatetime',
          's.end_datetime as endDatetime',
        ])

      const bestSale = this.pickBestPerVariant(saleRows, 'sale', opts?.includeZeroStock ?? false)
      for (const hit of bestSale) {
        // jangan override flash
        if (!result[hit.variantId]) result[hit.variantId] = hit
      }
    }

    return result
  }

  private pickBestPerVariant(rows: any[], kind: VariantPromoKind, includeZeroStock: boolean) {
    const byVariant: Record<number, VariantPromoHit[]> = {}

    for (const r of rows || []) {
      const variantId = Number(r?.variantId ?? 0)
      const price = Number(r?.price ?? 0)
      const stock = Number(r?.stock ?? 0)
      const promoId = Number(r?.promoId ?? 0)

      if (!variantId || !promoId) continue
      if (!includeZeroStock && stock <= 0) continue
      if (!(price > 0)) continue

      ;(byVariant[variantId] ||= []).push({
        kind,
        promoId,
        variantId,
        price,
        stock,
        startDatetime: r?.startDatetime ?? null,
        endDatetime: r?.endDatetime ?? null,
      })
    }

    const picked: VariantPromoHit[] = []
    for (const variantIdStr of Object.keys(byVariant)) {
      const variantId = Number(variantIdStr)
      const list = byVariant[variantId] || []

      list.sort((a, b) => {
        // 1) start_datetime terbaru menang
        const as = a.startDatetime ? new Date(a.startDatetime).getTime() : 0
        const bs = b.startDatetime ? new Date(b.startDatetime).getTime() : 0
        if (bs !== as) return bs - as

        if (a.price !== b.price) return a.price - b.price

        return b.promoId - a.promoId
      })

      picked.push(list[0])
    }

    return picked
  }
}
