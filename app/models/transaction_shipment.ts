import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class TransactionShipment extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare service: string | null

  @column()
  declare serviceType: string | null

  @column()
  declare price: string | null

  @column()
  declare estimationArrival: string | null

  @column()
  declare isProtected: boolean

  @column()
  declare protectionFee: number

  @column()
  declare address: string | null

  @column()
  declare recipe: string | null

  @column()
  declare pic: string

  @column()
  declare pic_phone: string

  @column()
  declare provinceId: number | null

  @column()
  declare cityId: number | null

  @column()
  declare districtId: number | null

  @column()
  declare subdistrictId: number | null

  @column()
  declare postalCode: string

  @column()
  declare transactionId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
