import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Sale from '#models/sale'
import ProductVariant from '#models/product_variant'

export default class SaleVariant extends BaseModel {
  public static table = 'sale_variants'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'sale_id' })
  declare saleId: number

  @column({ columnName: 'product_variant_id' })
  declare productVariantId: number

  @column({ columnName: 'sale_price' })
  declare salePrice: number

  @column()
  declare stock: number

  @belongsTo(() => Sale)
  declare sale: BelongsTo<typeof Sale>

  @belongsTo(() => ProductVariant, { foreignKey: 'productVariantId' })
  declare variant: BelongsTo<typeof ProductVariant>
}
