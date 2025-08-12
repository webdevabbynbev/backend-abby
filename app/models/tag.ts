import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, scope } from '@adonisjs/lucid/orm'
import SubTag from './sub_tag.js'
import type { HasMany } from '@adonisjs/lucid/types/relations'

export default class Tag extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare path: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  // Relasi ke SubTag
  @hasMany(() => SubTag, {
    foreignKey: 'tagId',
  })
  declare subTags: HasMany<typeof SubTag>

  // Scope untuk data aktif
  public static active = scope((query) => {
    query.whereNull('deleted_at')
  })

  public static trashed = scope((query) => {
    query.whereNotNull('deleted_at')
  })

  // Soft delete
  public async softDelete() {
    this.deletedAt = DateTime.now()
    await this.save()
  }

  // Restore
  public async restore() {
    this.deletedAt = null
    await this.save()
  }
}
