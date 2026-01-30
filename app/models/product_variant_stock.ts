import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import ProductVariant from './product_variant.js'

export enum StockChannel {
  WEBSITE = 'website',
  OFFLINE_STORE = 'offline_store', 
  MARKETPLACE_TOKOPEDIA = 'marketplace_tokopedia',
  MARKETPLACE_SHOPEE = 'marketplace_shopee',
  MARKETPLACE_BLIBLI = 'marketplace_blibli',
  MARKETPLACE_TIKTOK = 'marketplace_tiktok',
}

export default class ProductVariantStock extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare productVariantId: number

  @column()
  declare channel: string

  @column()
  declare stock: number

  @column()
  declare reservedStock: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => ProductVariant)
  declare variant: BelongsTo<typeof ProductVariant>

  /**
   * Get available stock (stock - reserved)
   */
  get availableStock(): number {
    return Math.max(0, (this.stock || 0) - (this.reservedStock || 0))
  }

  /**
   * Check if stock is sufficient for quantity
   */
  public hasSufficientStock(quantity: number): boolean {
    return this.availableStock >= quantity
  }
}