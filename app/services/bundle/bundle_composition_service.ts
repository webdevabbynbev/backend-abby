import ProductVariant from '#models/product_variant'
import ProductVariantBundleItem from '#models/product_variant_bundle_item'
import NumberUtils from '#utils/number'

export type BundleComponentSnapshot = {
  component_variant_id: number
  component_qty: number
  total_qty: number
}

export class BundleCompositionService {
  async getItems(trx: any, bundleVariantId: number) {
    const rows = await ProductVariantBundleItem.query({ client: trx })
      .where('bundle_variant_id', bundleVariantId)
      .orderBy('id', 'asc')

    return rows.map((r: any) => ({
      componentVariantId: NumberUtils.toNumber(r.componentVariantId ?? r.component_variant_id, 0),
      componentQty: Math.max(1, NumberUtils.toNumber(r.componentQty ?? r.component_qty, 1)),
    }))
  }

  async computeAvailable(trx: any, bundleVariantId: number): Promise<number> {
    const items = await this.getItems(trx, bundleVariantId)
    if (!items.length) return 0

    const compIds = Array.from(new Set(items.map((i) => i.componentVariantId))).sort((a, b) => a - b)

    const comps = await ProductVariant.query({ client: trx })
      .whereIn('id', compIds)
      .forUpdate()
      .select(['id', 'stock'])

    if (comps.length !== compIds.length) return 0

    const stockMap = new Map<number, number>(comps.map((c: any) => [c.id, NumberUtils.toNumber(c.stock, 0)]))

    let available = Infinity
    for (const it of items) {
      const s = stockMap.get(it.componentVariantId) ?? 0
      const canMake = Math.floor(s / it.componentQty)
      available = Math.min(available, canMake)
    }

    return Number.isFinite(available) ? Math.max(0, available) : 0
  }

  /**
   * Consume component stock for bundle purchase.
   * Return snapshot for transaction_detail.attributes (biar bisa restore).
   */
  async consume(trx: any, bundleVariantId: number, bundleQty: number): Promise<BundleComponentSnapshot[]> {
    const qty = Math.max(0, NumberUtils.toNumber(bundleQty, 0))
    if (qty <= 0) return []

    const items = await this.getItems(trx, bundleVariantId)
    if (!items.length) {
      const err: any = new Error('Bundle items not configured')
      err.httpStatus = 400
      throw err
    }

    const compIds = Array.from(new Set(items.map((i) => i.componentVariantId))).sort((a, b) => a - b)

    const comps = await ProductVariant.query({ client: trx })
      .whereIn('id', compIds)
      .forUpdate()
      .select(['id', 'stock'])

    if (comps.length !== compIds.length) {
      const err: any = new Error('Salah satu komponen bundle tidak ditemukan')
      err.httpStatus = 400
      throw err
    }

    const compMap = new Map<number, any>(comps.map((c: any) => [c.id, c]))

    // check enough
    for (const it of items) {
      const need = qty * it.componentQty
      const pv = compMap.get(it.componentVariantId)
      const stockNow = NumberUtils.toNumber(pv?.stock, 0)
      if (!pv || stockNow < need) {
        const err: any = new Error(`Stock komponen tidak cukup. component_variant_id=${it.componentVariantId}`)
        err.httpStatus = 400
        throw err
      }
    }

    // decrement
    for (const it of items) {
      const need = qty * it.componentQty
      const pv = compMap.get(it.componentVariantId)
      pv.stock = NumberUtils.toNumber(pv.stock, 0) - need
      await pv.useTransaction(trx).save()
    }

    return items.map((it) => ({
      component_variant_id: it.componentVariantId,
      component_qty: it.componentQty,
      total_qty: qty * it.componentQty,
    }))
  }

  async restore(trx: any, snapshot: BundleComponentSnapshot[]) {
    if (!Array.isArray(snapshot) || !snapshot.length) return

    const ids = Array.from(
      new Set(snapshot.map((x) => NumberUtils.toNumber((x as any).component_variant_id, 0)).filter((x) => x > 0))
    ).sort((a, b) => a - b)

    const comps = await ProductVariant.query({ client: trx }).whereIn('id', ids).forUpdate().select(['id', 'stock'])
    const compMap = new Map<number, any>(comps.map((c: any) => [c.id, c]))

    for (const it of snapshot) {
      const id = NumberUtils.toNumber((it as any).component_variant_id, 0)
      const add = Math.max(0, NumberUtils.toNumber((it as any).total_qty, 0))
      const pv = compMap.get(id)
      if (!pv || add <= 0) continue

      pv.stock = NumberUtils.toNumber(pv.stock, 0) + add
      await pv.useTransaction(trx).save()
    }
  }
}
