import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import ProductVariant from '#models/product_variant'
import ProductVariantBundleItem from '#models/product_variant_bundle_item'
import StockMovement from '#models/stock_movement'
import NumberUtils from '#utils/number'

type BundleStockMode = 'KIT' | 'VIRTUAL'

export class BundleKitService {
  private normalizeQty(input: any) {
    const n = Math.floor(NumberUtils.toNumber(input, 0))
    return Number.isFinite(n) ? n : 0
  }

  /**
   * ✅ NEW: versi assemble yang JALAN DI TRANSACTION DARI LUAR
   * Jangan bikin db.transaction di sini.
   */
  public async assembleInTrx(
    trx: TransactionClientContract,
    bundleVariantId: number,
    qtyInput: any,
    note?: string
  ) {
    const qty = this.normalizeQty(qtyInput)
    if (qty <= 0) {
      const err: any = new Error('qty wajib > 0')
      err.httpStatus = 400
      throw err
    }

    const bundle = await ProductVariant.query({ client: trx })
      .where('id', bundleVariantId)
      .whereNull('deleted_at')
      .forUpdate()
      .first()

    if (!bundle) {
      const err: any = new Error('Bundle variant tidak ditemukan')
      err.httpStatus = 404
      throw err
    }

    const isBundle = Boolean((bundle as any).isBundle)
    const mode = String(((bundle as any).bundleStockMode ?? '') as BundleStockMode).toUpperCase()

    if (!isBundle) {
      const err: any = new Error('Variant ini bukan bundle')
      err.httpStatus = 400
      throw err
    }

    if (mode !== 'KIT') {
      const err: any = new Error('Bundle stock mode harus KIT untuk assemble')
      err.httpStatus = 400
      throw err
    }

    const items = await ProductVariantBundleItem.query({ client: trx })
      .where('bundle_variant_id', bundleVariantId)
      .orderBy('id', 'asc')

    if (!items.length) {
      const err: any = new Error('Bundle items belum diset')
      err.httpStatus = 400
      throw err
    }

    const normalized = items.map((r: any) => ({
      componentVariantId: NumberUtils.toNumber(r.componentVariantId ?? r.component_variant_id, 0),
      componentQty: Math.max(1, NumberUtils.toNumber(r.componentQty ?? r.component_qty, 1)),
    }))

    const compIds = Array.from(new Set(normalized.map((x) => x.componentVariantId))).filter((x) => x > 0)
    if (!compIds.length) {
      const err: any = new Error('Bundle items invalid')
      err.httpStatus = 400
      throw err
    }

    const components = await ProductVariant.query({ client: trx })
      .whereIn('id', compIds)
      .whereNull('deleted_at')
      .forUpdate()
      .select(['id', 'stock'])

    if (components.length !== compIds.length) {
      const err: any = new Error('Ada komponen bundle yang tidak ditemukan / sudah dihapus')
      err.httpStatus = 400
      throw err
    }

    const compMap = new Map<number, any>(components.map((c: any) => [c.id, c]))

    // check cukup
    for (const it of normalized) {
      const pv = compMap.get(it.componentVariantId)
      const stockNow = NumberUtils.toNumber(pv?.stock, 0)
      const need = qty * it.componentQty
      if (!pv || stockNow < need) {
        const err: any = new Error(
          `Stock komponen tidak cukup. component_variant_id=${it.componentVariantId}, butuh=${need}, tersedia=${stockNow}`
        )
        err.httpStatus = 400
        throw err
      }
    }

    // decrement komponen + log
    const componentChanges: any[] = []
    for (const it of normalized) {
      const pv = compMap.get(it.componentVariantId)
      const before = NumberUtils.toNumber(pv.stock, 0)
      const change = qty * it.componentQty

      pv.stock = before - change
      await pv.useTransaction(trx).save()

      componentChanges.push({
        component_variant_id: pv.id,
        before,
        after: pv.stock,
        change: -change,
      })

      await StockMovement.create(
        {
          productVariantId: pv.id,
          change: -change,
          type: 'bundle_assemble_component',
          relatedId: bundleVariantId,
          note: note || `Assemble bundle ${bundleVariantId}`,
        },
        { client: trx }
      )
    }

    // increment bundle stock + log
    const bundleBefore = NumberUtils.toNumber((bundle as any).stock, 0)
    ;(bundle as any).stock = bundleBefore + qty
    await bundle.useTransaction(trx).save()

    await StockMovement.create(
      {
        productVariantId: bundleVariantId,
        change: qty,
        type: 'bundle_assemble',
        relatedId: bundleVariantId,
        note: note || `Assemble bundle ${bundleVariantId}`,
      },
      { client: trx }
    )

    return {
      bundle: {
        id: bundle.id,
        stock_before: bundleBefore,
        stock_after: (bundle as any).stock,
        change: qty,
      },
      components: componentChanges,
    }
  }

  /**
   * Wrapper lama (backward compatible)
   */
  async assemble(bundleVariantId: number, qtyInput: any, note?: string) {
    return db.transaction((trx) => this.assembleInTrx(trx, bundleVariantId, qtyInput, note))
  }

  /**
   * ✅ NEW: versi disassemble yang JALAN DI TRANSACTION DARI LUAR
   */
  public async disassembleInTrx(
    trx: TransactionClientContract,
    bundleVariantId: number,
    qtyInput: any,
    note?: string
  ) {
    const qty = this.normalizeQty(qtyInput)
    if (qty <= 0) {
      const err: any = new Error('qty wajib > 0')
      err.httpStatus = 400
      throw err
    }

    const bundle = await ProductVariant.query({ client: trx })
      .where('id', bundleVariantId)
      .whereNull('deleted_at')
      .forUpdate()
      .first()

    if (!bundle) {
      const err: any = new Error('Bundle variant tidak ditemukan')
      err.httpStatus = 404
      throw err
    }

    const isBundle = Boolean((bundle as any).isBundle)
    const mode = String(((bundle as any).bundleStockMode ?? '') as BundleStockMode).toUpperCase()

    if (!isBundle) {
      const err: any = new Error('Variant ini bukan bundle')
      err.httpStatus = 400
      throw err
    }

    if (mode !== 'KIT') {
      const err: any = new Error('Bundle stock mode harus KIT untuk disassemble')
      err.httpStatus = 400
      throw err
    }

    const bundleStock = NumberUtils.toNumber((bundle as any).stock, 0)
    if (bundleStock < qty) {
      const err: any = new Error(`Stock bundle tidak cukup. tersedia=${bundleStock}`)
      err.httpStatus = 400
      throw err
    }

    const items = await ProductVariantBundleItem.query({ client: trx })
      .where('bundle_variant_id', bundleVariantId)
      .orderBy('id', 'asc')

    if (!items.length) {
      const err: any = new Error('Bundle items belum diset')
      err.httpStatus = 400
      throw err
    }

    const normalized = items.map((r: any) => ({
      componentVariantId: NumberUtils.toNumber(r.componentVariantId ?? r.component_variant_id, 0),
      componentQty: Math.max(1, NumberUtils.toNumber(r.componentQty ?? r.component_qty, 1)),
    }))

    const compIds = Array.from(new Set(normalized.map((x) => x.componentVariantId))).filter((x) => x > 0)
    if (!compIds.length) {
      const err: any = new Error('Bundle items invalid')
      err.httpStatus = 400
      throw err
    }

    const components = await ProductVariant.query({ client: trx })
      .whereIn('id', compIds)
      .whereNull('deleted_at')
      .forUpdate()
      .select(['id', 'stock'])

    if (components.length !== compIds.length) {
      const err: any = new Error('Ada komponen bundle yang tidak ditemukan / sudah dihapus')
      err.httpStatus = 400
      throw err
    }

    const compMap = new Map<number, any>(components.map((c: any) => [c.id, c]))

    // decrement bundle
    const bundleBefore = bundleStock
    ;(bundle as any).stock = bundleBefore - qty
    await bundle.useTransaction(trx).save()

    await StockMovement.create(
      {
        productVariantId: bundleVariantId,
        change: -qty,
        type: 'bundle_disassemble',
        relatedId: bundleVariantId,
        note: note || `Disassemble bundle ${bundleVariantId}`,
      },
      { client: trx }
    )

    // restore komponen + log
    const componentChanges: any[] = []
    for (const it of normalized) {
      const pv = compMap.get(it.componentVariantId)
      const before = NumberUtils.toNumber(pv.stock, 0)
      const add = qty * it.componentQty

      pv.stock = before + add
      await pv.useTransaction(trx).save()

      componentChanges.push({
        component_variant_id: pv.id,
        before,
        after: pv.stock,
        change: add,
      })

      await StockMovement.create(
        {
          productVariantId: pv.id,
          change: add,
          type: 'bundle_disassemble_component',
          relatedId: bundleVariantId,
          note: note || `Disassemble bundle ${bundleVariantId}`,
        },
        { client: trx }
      )
    }

    return {
      bundle: {
        id: bundle.id,
        stock_before: bundleBefore,
        stock_after: (bundle as any).stock,
        change: -qty,
      },
      components: componentChanges,
    }
  }

  /**
   * Wrapper lama (backward compatible)
   */
  async disassemble(bundleVariantId: number, qtyInput: any, note?: string) {
    return db.transaction((trx) => this.disassembleInTrx(trx, bundleVariantId, qtyInput, note))
  }
}
