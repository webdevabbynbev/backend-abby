import { DateTime } from 'luxon'
import {
  BaseModel,
  column,
  belongsTo,
} from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

import Discount from '#models/discount'
import Product from '#models/product'
import ProductVariant from '#models/product_variant'

export type DiscountValueType = 'percent' | 'fixed'

export default class DiscountVariantItem extends BaseModel {
  public static table = 'discount_variant_items'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'discount_id' })
  declare discountId: number

  @column({ columnName: 'product_id' })
  declare productId: number | null

  @column({ columnName: 'product_variant_id' })
  declare productVariantId: number

  @column({ columnName: 'is_active' })
  declare isActive: boolean

  @column({ columnName: 'value_type' })
  declare valueType: DiscountValueType

  // decimal biasanya dibaca string dari DB driver.
  // Kita cast ke number biar enak dipakai pricing engine.
  @column({
    columnName: 'value',
    consume: (v) => (v === null || v === undefined ? 0 : Number(v)),
  })
  declare value: number

  @column({
    columnName: 'max_discount',
    consume: (v) => (v === null || v === undefined ? null : Number(v)),
  })
  declare maxDiscount: number | null

  @column({ columnName: 'promo_stock' })
  declare promoStock: number | null

  @column({ columnName: 'purchase_limit' })
  declare purchaseLimit: number | null

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Discount, { foreignKey: 'discountId' })
  declare discount: BelongsTo<typeof Discount>

  @belongsTo(() => Product, { foreignKey: 'productId' })
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => ProductVariant, { foreignKey: 'productVariantId' })
  declare productVariant: BelongsTo<typeof ProductVariant>
}
