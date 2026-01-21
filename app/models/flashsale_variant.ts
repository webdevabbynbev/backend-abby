import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import FlashSale from '#models/flashsale'
import ProductVariant from '#models/product_variant'

export default class FlashSaleVariant extends BaseModel {
  public static table = 'flashsale_variants'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'flash_sale_id' })
  declare flashSaleId: number

  @column({ columnName: 'product_variant_id' })
  declare productVariantId: number

  @column({ columnName: 'flash_price' })
  declare flashPrice: number

  @column()
  declare stock: number

  @belongsTo(() => FlashSale)
  declare flashSale: BelongsTo<typeof FlashSale>

  @belongsTo(() => ProductVariant, { foreignKey: 'productVariantId' })
  declare variant: BelongsTo<typeof ProductVariant>
}
