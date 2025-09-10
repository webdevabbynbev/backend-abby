import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, scope } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Product from './product.js'

export default class Brand extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare slug: string

  @column()
  declare description: string

  @column()
  declare logoUrl: string

  @column()
  declare bannerUrl: string

  @column()
  declare country: string

  @column()
  declare website: string

  @column()
  declare isActive: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  // Relasi: satu brand punya banyak produk
  @hasMany(() => Product)
  declare products: HasMany<typeof Product>

  public async softDelete() {
    this.deletedAt = DateTime.now()
    await this.save()
  }

  public async restore() {
    this.deletedAt = null
    await this.save()
  }

  // Scope untuk mengambil hanya data yang tidak terhapus
  public static active = scope((query) => {
    return query.whereNull('deleted_at')
  })

  // Scope untuk mengambil hanya data yang sudah dihapus
  public static trashed = scope((query) => {
    query.whereNotNull('deleted_at')
  })
}
