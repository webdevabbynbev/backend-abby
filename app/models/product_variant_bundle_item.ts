import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ProductVariant from '#models/product_variant'

export default class ProductVariantBundleItem extends BaseModel {
  public static table = 'product_variant_bundle_items'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'bundle_variant_id' })
  declare bundleVariantId: number

  @column({ columnName: 'component_variant_id' })
  declare componentVariantId: number

  @column({ columnName: 'component_qty' })
  declare componentQty: number

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime

  // =========================
  // RELATIONS
  // =========================
  @belongsTo(() => ProductVariant, { foreignKey: 'bundleVariantId' })
  declare bundleVariant: BelongsTo<typeof ProductVariant>

  @belongsTo(() => ProductVariant, { foreignKey: 'componentVariantId' })
  declare componentVariant: BelongsTo<typeof ProductVariant>
}
