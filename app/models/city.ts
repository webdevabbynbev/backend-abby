import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class City extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare province: string | null

  @column()
  declare type: string | null

  @column()
  declare name: string

  @column()
  declare postalCode: string | null

  @column()
  declare provinceId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
