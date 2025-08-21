import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import Product from './product.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ProductVariant from './product_variant.js'
import User from './user.js'

export default class TransactionCart extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare qty: number

  @column()
  declare price: string

  @column()
  declare amount: string

  @column()
  declare discount: string

  @column()
  declare productVariantId: number

  @column()
  declare productId: number

  @column()
  declare userId: number

  @column()
  declare qtyCheckout: number

  @column()
  declare isCheckout: number

  @column()
  declare attributes: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Product, {
    foreignKey: 'productId',
  })
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => User, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => ProductVariant, {
    foreignKey: 'productVariantId',
  })
  declare variant: BelongsTo<typeof ProductVariant>
}
