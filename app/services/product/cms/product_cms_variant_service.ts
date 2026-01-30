import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import AttributeValue from '#models/attribute_value'
import Product from '#models/product'
import ProductVariant from '#models/product_variant'
import ProductVariantBundleItem from '#models/product_variant_bundle_item'
import type { CmsProductUpsertPayload, UpsertVariantsOptions } from './cms_product_types.js'
import { SkuService } from '../sku_service.js'

type BundleStockMode = 'KIT' | 'VIRTUAL'

export class ProductCmsVariantService {
  constructor(private sku: SkuService) {}

  private normalizePrice(value: number | string) {
    const normalized = Number(value)
    return Number.isFinite(normalized) ? String(normalized) : String(value ?? 0)
  }

  private normalizeBundleStockMode(input: any, fallback: BundleStockMode): BundleStockMode {
    const raw = String(input ?? '').toUpperCase().trim()
    if (raw === 'KIT' || raw === 'VIRTUAL') return raw
    return fallback
  }

  private normalizeBundleItems(
    input: any
  ): Array<{ componentVariantId: number; componentQty: number }> {
    if (!Array.isArray(input)) return []

    const normalized = input
      .map((it) => ({
        componentVariantId: Number(it?.component_variant_id),
        componentQty: Number(it?.qty),
      }))
      .filter(
        (it) =>
          Number.isFinite(it.componentVariantId) &&
          Number.isFinite(it.componentQty) &&
          it.componentQty >= 1
      )

    const map = new Map<number, number>()
    for (const it of normalized) {
      map.set(it.componentVariantId, (map.get(it.componentVariantId) ?? 0) + it.componentQty)
    }

    return Array.from(map.entries()).map(([componentVariantId, componentQty]) => ({
      componentVariantId,
      componentQty,
    }))
  }

  private async syncAttributeValues(
    variantId: number,
    combination: number[] | undefined,
    trx: TransactionClientContract
  ) {
    if (!Array.isArray(combination)) return

    const combinationIds = combination.map((id) => Number(id)).filter((id) => Number.isFinite(id))

    const clearQuery = AttributeValue.query({ client: trx }).where('product_variant_id', variantId)
    if (combinationIds.length) {
      clearQuery.whereNotIn('id', combinationIds)
    }
    await clearQuery.update({ productVariantId: null })

    if (!combinationIds.length) return

    await AttributeValue.query({ client: trx })
      .whereIn('id', combinationIds)
      .update({ productVariantId: variantId, deletedAt: null })
  }

  private async clearBundleItems(bundleVariantId: number, trx: TransactionClientContract) {
    await ProductVariantBundleItem.query({ client: trx })
      .where('bundle_variant_id', bundleVariantId)
      .delete()
  }

  private async upsertBundleItems(
    bundleVariantId: number,
    items: Array<{ componentVariantId: number; componentQty: number }>,
    trx: TransactionClientContract
  ) {
    await this.clearBundleItems(bundleVariantId, trx)
    if (!items.length) return

    for (const it of items) {
      if (it.componentVariantId === bundleVariantId) {
        throw new Error('Bundle tidak boleh memasukkan variant dirinya sendiri sebagai komponen')
      }
    }

    const componentIds = items.map((i) => i.componentVariantId)
    const components = await ProductVariant.query({ client: trx })
      .whereIn('id', componentIds)
      .whereNull('deleted_at')
      .select(['id', 'is_bundle'])

    if (components.length !== componentIds.length) {
      throw new Error('Salah satu komponen bundle tidak ditemukan / sudah dihapus')
    }

    const hasBundleComponent = components.some((c: any) => Boolean(c.isBundle))
    if (hasBundleComponent) {
      throw new Error('Komponen bundle tidak boleh berupa bundle variant (fase 1)')
    }

    await ProductVariantBundleItem.createMany(
      items.map((it) => ({
        bundleVariantId,
        componentVariantId: it.componentVariantId,
        componentQty: it.componentQty,
      })),
      { client: trx }
    )
  }

  private async computeBundleStock(
    items: Array<{ componentVariantId: number; componentQty: number }>,
    trx: TransactionClientContract
  ): Promise<number> {
    if (!items.length) return 0

    const ids = Array.from(new Set(items.map((i) => i.componentVariantId))).sort((a, b) => a - b)

    const comps = await ProductVariant.query({ client: trx })
      .whereIn('id', ids)
      .forUpdate()
      .select(['id', 'stock'])

    const stockMap = new Map<number, number>(comps.map((c) => [c.id, Number(c.stock || 0)]))

    let available = Infinity
    for (const it of items) {
      const s = stockMap.get(it.componentVariantId) ?? 0
      const canMake = Math.floor(s / it.componentQty)
      available = Math.min(available, canMake)
    }

    return Number.isFinite(available) ? Math.max(0, available) : 0
  }

  private async assertKitCompositionChangeAllowed(
    bundleVariantId: number,
    nextItems: Array<{ componentVariantId: number; componentQty: number }>,
    trx: TransactionClientContract
  ) {
    const bundle = await ProductVariant.query({ client: trx })
      .where('id', bundleVariantId)
      .forUpdate()
      .select(['id', 'stock', 'bundle_stock_mode', 'is_bundle'])
      .first()

    if (!bundle) return
    const stockNow = Number(bundle.stock || 0)
    if (stockNow <= 0) return

    // kalau stock > 0, komposisi tidak boleh berubah
    const current = await ProductVariantBundleItem.query({ client: trx })
      .where('bundle_variant_id', bundleVariantId)

    const curMap = new Map<number, number>()
    for (const r of current as any[]) {
      curMap.set(
        Number(r.componentVariantId ?? r.component_variant_id),
        Number(r.componentQty ?? r.component_qty)
      )
    }

    const nextMap = new Map<number, number>()
    for (const it of nextItems) {
      nextMap.set(it.componentVariantId, it.componentQty)
    }

    if (curMap.size !== nextMap.size) {
      const err: any = new Error('Komposisi bundle KIT tidak boleh diubah jika stock bundle > 0. Disassemble dulu sampai 0.')
      err.httpStatus = 400
      throw err
    }

    for (const [id, qty] of curMap.entries()) {
      if (nextMap.get(id) !== qty) {
        const err: any = new Error('Komposisi bundle KIT tidak boleh diubah jika stock bundle > 0. Disassemble dulu sampai 0.')
        err.httpStatus = 400
        throw err
      }
    }
  }

  public async upsert(
    product: Product,
    payload: CmsProductUpsertPayload,
    trx: TransactionClientContract,
    opts?: UpsertVariantsOptions
  ) {
    if (!payload.variants?.length) return

    const keepIds: number[] = []

    for (const v of payload.variants) {
      const masterSku = product.masterSku || `PRD-${product.id}`

      const rawBundleItems = (v as any).bundle_items
      const bundleItemsProvided = rawBundleItems !== undefined // undefined = tidak dikirim
      const bundleItems = this.normalizeBundleItems(rawBundleItems)

      // kalau bundle_items dikirim sebagai [] => artinya admin mau clear bundle
      const explicitClearBundle = bundleItemsProvided && Array.isArray(rawBundleItems) && bundleItems.length === 0

      if (v.id) {
        const variant = await ProductVariant.query({ client: trx })
          .where('id', v.id)
          .where('product_id', product.id)
          .first()

        if (!variant) continue

        const existingIsBundle = Boolean((variant as any).isBundle)
        const willBeBundle =
          explicitClearBundle ? false
          : bundleItemsProvided ? bundleItems.length > 0
          : existingIsBundle

        variant.useTransaction(trx)
        variant.barcode = v.barcode
        variant.sku = await this.sku.generateVariantSku(masterSku, v.barcode, trx)
        variant.price = this.normalizePrice(v.price)

        if (!willBeBundle) {
          variant.isBundle = false
          ;(variant as any).bundleStockMode = 'KIT'
          await this.clearBundleItems(variant.id, trx)
          variant.stock = Number(v.stock)
        } else {
          variant.isBundle = true

          const mode = this.normalizeBundleStockMode(
            (v as any).bundle_stock_mode,
            ((variant as any).bundleStockMode as BundleStockMode) || 'KIT'
          )
          ;(variant as any).bundleStockMode = mode

          if (bundleItemsProvided && bundleItems.length > 0) {
            // guard untuk KIT: tidak boleh ubah komposisi jika stock > 0
            if (mode === 'KIT') {
              await this.assertKitCompositionChangeAllowed(variant.id, bundleItems, trx)
            }
            await this.upsertBundleItems(variant.id, bundleItems, trx)
          }

          if (mode === 'VIRTUAL') {
            // kalau VIRTUAL dan items tidak dikirim, kita gak recompute agar gak berubah diam-diam
            if (bundleItemsProvided && bundleItems.length > 0) {
              variant.stock = await this.computeBundleStock(bundleItems, trx)
            }
          } else {
            // KIT: stock independen, jangan di-override dari komponen
          }
        }

        await variant.save()
        await this.syncAttributeValues(variant.id, v.combination, trx)
        keepIds.push(variant.id)
      } else {
        // CREATE
        const sku = await this.sku.generateVariantSku(masterSku, v.barcode, trx)

        const newVariant = new ProductVariant()
        newVariant.useTransaction(trx)
        newVariant.productId = product.id
        newVariant.sku = sku
        newVariant.barcode = v.barcode
        newVariant.price = this.normalizePrice(v.price)

        const isBundle = bundleItems.length > 0

        if (!isBundle) {
          newVariant.isBundle = false
          ;(newVariant as any).bundleStockMode = 'KIT'
          newVariant.stock = Number(v.stock)
          await newVariant.save()
        } else {
          newVariant.isBundle = true
          const mode = this.normalizeBundleStockMode((v as any).bundle_stock_mode, 'KIT')
          ;(newVariant as any).bundleStockMode = mode

          // KIT aman start dari 0 (stock ditambah via assemble)
          newVariant.stock = mode === 'KIT' ? 0 : 0
          await newVariant.save()

          await this.upsertBundleItems(newVariant.id, bundleItems, trx)

          if (mode === 'VIRTUAL') {
            newVariant.stock = await this.computeBundleStock(bundleItems, trx)
            await newVariant.save()
          }
        }

        await this.syncAttributeValues(newVariant.id, v.combination, trx)
        keepIds.push(newVariant.id)
      }
    }

    if (opts?.isUpdate && keepIds.length) {
      await ProductVariant.query({ client: trx })
        .where('product_id', product.id)
        .whereNotIn('id', keepIds)
        .delete()
    }
  }
}
