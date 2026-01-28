import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import StockMovement from '#models/stock_movement'
import ProductVariantStock from '#models/product_variant_stock'
import Product from './product.js'
import ProductMedia from './product_media.js'
import AttributeValue from './attribute_value.js'

export default class ProductVariant extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare sku: string

  @column()
  declare barcode: string

  // biasanya DECIMAL di MySQL kebaca string, jadi aman string
  @column()
  declare price: string

  @column()
  declare stock: number

  @column()
  declare bpom: string | null

  @column()
  declare ingredients: string | null
  
  @column({ columnName: 'product_id' })
  declare productId: number | null

  @column()
  declare width: number | null

  @column()
  declare height: number | null

  @column()
  declare length: number | null

  @column.dateTime({ columnName: 'deleted_at' })
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime

  // =========================
  // RELATIONS
  // =========================
  @belongsTo(() => Product, { foreignKey: 'productId' })
  declare product: BelongsTo<typeof Product>

  // jalan kalau product_medias ada kolom variant_id
  @hasMany(() => ProductMedia, { foreignKey: 'variantId' })
  declare medias: HasMany<typeof ProductMedia>

  // ✅ AttributeValue nempel langsung ke variant via product_variant_id
  @hasMany(() => AttributeValue, { foreignKey: 'productVariantId' })
  declare attributes: HasMany<typeof AttributeValue>

  // ✅ Channel stocks for multi-channel inventory
  @hasMany(() => ProductVariantStock, { foreignKey: 'productVariantId' })
  declare channelStocks: HasMany<typeof ProductVariantStock>

  // =========================
  // SCOPES
  // =========================
  public static active = scope((query) => {
    query.whereNull('product_variants.deleted_at')
  })
    public async adjustStock(
    change: number,
    type: string,
    relatedId?: number,
    note?: string | null,
    trx?: TransactionClientContract
  ) {
    const delta = Number(change)
    if (!Number.isFinite(delta) || delta === 0) return this

    this.stock = Number(this.stock || 0) + delta

    const variant = trx ? this.useTransaction(trx) : this
    await variant.save()

    const movement = new StockMovement()
    movement.productVariantId = this.id
    movement.change = delta
    movement.type = type
    movement.relatedId = relatedId ?? null
    movement.note = note ?? null

    if (trx) {
      movement.useTransaction(trx)
    }
    await movement.save()

    return this
  }
}
