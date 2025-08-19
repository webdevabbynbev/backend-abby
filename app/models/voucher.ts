import { DateTime } from 'luxon'
import { BaseModel, column, scope } from '@adonisjs/lucid/orm'

export default class Voucher extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare code: string

  @column()
  declare price: string

  @column()
  declare maxDiscPrice: string

  @column()
  declare percentage: number

  @column()
  declare isPercentage: number

  @column()
  declare isActive: number

  @column()
  declare type: number

  @column()
  declare qty: number

  @column.dateTime()
  declare expiredAt: DateTime | null

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

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
