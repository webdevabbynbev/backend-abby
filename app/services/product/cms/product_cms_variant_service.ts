import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import Product from '#models/product'
import ProductVariant from '#models/product_variant'
import { SkuService } from '../sku_service.js'
import type { CmsProductUpsertPayload, UpsertVariantsOptions } from './cms_product_types.js'
import AttributeValue from '#models/attribute_value'

export class ProductCmsVariantService {
  constructor(private sku: SkuService) {}

private normalizePrice(value: number | string) {
    const normalized = Number(value)
    return Number.isFinite(normalized) ? String(normalized) : String(value ?? 0)
  }

  private async syncAttributeValues(
    variantId: number,
    combination: number[] | undefined,
    trx: TransactionClientContract
  ) {
    if (!Array.isArray(combination)) return

    const combinationIds = combination
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))

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

      if (v.id) {
        const variant = await ProductVariant.query({ client: trx })
          .where('id', v.id)
          .where('product_id', product.id)
          .first()

        if (!variant) continue

        variant.useTransaction(trx)
        variant.barcode = v.barcode
        variant.sku = await this.sku.generateVariantSku(masterSku, v.barcode, trx)
        variant.price = this.normalizePrice(v.price)
        variant.stock = Number(v.stock)
        await variant.save()

        await this.syncAttributeValues(variant.id, v.combination, trx)

        keepIds.push(variant.id)
      } else {
        const sku = await this.sku.generateVariantSku(masterSku, v.barcode, trx)

        const newVariant = new ProductVariant()
        newVariant.useTransaction(trx)
        newVariant.productId = product.id
        newVariant.sku = sku
        newVariant.barcode = v.barcode
        newVariant.price = this.normalizePrice(v.price)
        newVariant.stock = Number(v.stock)
        await newVariant.save()

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
