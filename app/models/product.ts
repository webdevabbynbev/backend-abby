import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany, scope, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import CategoryType from './category_type.js'
import ProductVariant from './product_variant.js'
import ProductDiscount from './product_discount.js'
import ProductMedia from './product_media.js'
import Review from './review.js'
import Tag from './tag.js'
import Brand from './brand.js'
import Concern from './concern.js'
import Persona from './persona.js'

export default class Product extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  // Basic Info
  @column()
  declare name: string

  @column()
  declare slug: string

  @column()
  declare description: string | null

  // Price & Stock
  @column()
  declare basePrice: number | null

  @column()
  declare weight: number

  // Flags & Status
  @column()
  declare isFlashsale: boolean

  @column()
  declare status: 'normal' | 'war' | 'draft'

  // Relations
  @column()
  declare categoryTypeId: number

  @column()
  declare brandId: number

  @column()
  declare personaId: number

  @belongsTo(() => CategoryType)
  declare categoryType: BelongsTo<typeof CategoryType>

  @belongsTo(() => Brand)
  declare brand: BelongsTo<typeof Brand>

  @belongsTo(() => Persona)
  declare persona: BelongsTo<typeof Persona>

  // SEO Meta
  @column()
  declare metaTitle: string | null

  @column()
  declare metaDescription: string | null

  @column()
  declare metaKeywords: string | null

  // Sorting & Path
  @column()
  declare position: number | null

  @column()
  declare popularity: string | null

  @column()
  declare path: string | null

  // Relations
  @hasMany(() => ProductVariant)
  declare variants: HasMany<typeof ProductVariant>

  @hasMany(() => ProductMedia)
  declare medias: HasMany<typeof ProductMedia>

  @hasMany(() => ProductDiscount)
  declare discounts: HasMany<typeof ProductDiscount>

  @hasMany(() => Review)
  declare reviews: HasMany<typeof Review>

  @manyToMany(() => Tag, {
    pivotTable: 'product_tags',
    pivotColumns: ['start_date', 'end_date'],
  })
  declare tags: ManyToMany<typeof Tag>
  
  @manyToMany(() => Concern, {
    pivotTable: 'product_concerns',
  })
  declare concerns: ManyToMany<typeof Concern>

  // Soft Delete & Timestamps
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  // Scope
  public static active = scope((query) => {
    query.whereNull('deleted_at')
  })

  public static trashed = scope((query) => {
    query.whereNotNull('deleted_at')
  })

  // Soft delete method
  public async softDelete() {
    this.deletedAt = DateTime.now()
    await this.save()
  }

  // Restore method
  public async restore() {
    this.deletedAt = null
    await this.save()
  }
}
