import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, manyToMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import Product from './product.js'
import AttributeValue from './attribute_value.js'

export default class ProductVariant extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare sku: string

  @column()
  declare barcode: string

  @column()
  declare price: string

  @column()
  declare stock: number

  @column()
  declare productId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  @manyToMany(() => AttributeValue, {
    pivotTable: 'variant_attributes',
  })
  declare attributes: ManyToMany<typeof AttributeValue>

  // Scope untuk mengambil hanya data yang tidak terhapus
  public static active = scope((query) => {
    query.whereNull('deleted_at')
  })

  // Scope untuk mengambil hanya data yang sudah dihapus
  public static trashed = scope((query) => {
    query.whereNotNull('deleted_at')
  })

  // Soft delete method
  public async softDelete() {
    this.deletedAt = DateTime.now()
    await this.save()
  }

  // Restore method untuk mengembalikan data yang terhapus
  public async restore() {
    this.deletedAt = null
    await this.save()
  }
}
