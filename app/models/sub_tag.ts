import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany, scope } from '@adonisjs/lucid/orm'
import Tag from './tag.js'
import DetailSubTag from './detail_sub_tag.js'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

export default class SubTag extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare path: string

  @column()
  declare tagId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  // Relasi ke Tag
  @belongsTo(() => Tag, {
    foreignKey: 'tagId',
  })
  declare tag: BelongsTo<typeof Tag>

  // Relasi ke DetailSubTag
  @hasMany(() => DetailSubTag, {
    foreignKey: 'subTagId',
  })
  declare detailSubTags: HasMany<typeof DetailSubTag>

  public static active = scope((query) => {
    query.whereNull('deleted_at')
  })

  public static trashed = scope((query) => {
    query.whereNotNull('deleted_at')
  })

  public async softDelete() {
    this.deletedAt = DateTime.now()
    await this.save()
  }

  public async restore() {
    this.deletedAt = null
    await this.save()
  }
}
