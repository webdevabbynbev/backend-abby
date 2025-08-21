import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Tag from './tag.js'
import SubTag from './sub_tag.js'
import DetailSubTag from './detail_sub_tag.js'
import CategoryType from './category_type.js'
import ProductVariant from './product_variant.js'
import ProductDiscount from './product_discount.js'
import ProductMedia from './product_media.js'
import Review from './review.js'

export default class Product extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column()
  declare weight: number

  @column()
  declare basePrice: string | null

  @column()
  declare isFlashsale: boolean

  @column()
  declare sizeChartId: number

  @column()
  declare tagId: number

  @column()
  declare subTagId: number

  @column()
  declare detailSubTagId: number

  @column()
  declare categoryTypeId: number

  @column()
  declare path: string | null

  @column()
  declare popularity: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @column()
  declare metaTitle: string | null

  @column()
  declare metaDescription: string | null

  @column()
  declare metaKeywords: string | null

  @belongsTo(() => Tag)
  declare tag: BelongsTo<typeof Tag>

  @belongsTo(() => SubTag)
  declare subTag: BelongsTo<typeof SubTag>

  @belongsTo(() => DetailSubTag)
  declare detailSubTag: BelongsTo<typeof DetailSubTag>

  @belongsTo(() => CategoryType)
  declare categoryType: BelongsTo<typeof CategoryType>

  @hasMany(() => ProductVariant)
  declare variants: HasMany<typeof ProductVariant>

  @hasMany(() => ProductMedia)
  declare medias: HasMany<typeof ProductMedia>

  @hasMany(() => ProductDiscount)
  declare discounts: HasMany<typeof ProductDiscount>

  @hasMany(() => Review)
  declare reviews: HasMany<typeof Review>

  @column()
  declare position: number

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