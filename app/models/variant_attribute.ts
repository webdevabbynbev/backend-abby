import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, scope } from '@adonisjs/lucid/orm'
import ProductVariant from './product_variant.js'
import AttributeValue from './attribute_value.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class VariantAttribute extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare productVariantId: number

  @column()
  declare attributeValueId: number

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => ProductVariant)
  declare productVariant: BelongsTo<typeof ProductVariant>

  @belongsTo(() => AttributeValue)
  declare attributeValue: BelongsTo<typeof AttributeValue>

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