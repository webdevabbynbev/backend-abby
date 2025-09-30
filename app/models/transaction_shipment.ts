import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Transaction from '#models/transaction'

export default class TransactionShipment extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare service: string | null

  @column()
  declare serviceType: string | null

  @column()
  declare price: number | null

  @column()
  declare estimationArrival: string | null

  @column()
  declare isProtected: number

  @column()
  declare protectionFee: number

  @column()
  declare address: string | null

  @column()
  declare resiNumber: string | null

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
  declare status: string | null

  @column({ columnName: 'transaction_id' })
  declare transactionId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Transaction)
  declare transaction: BelongsTo<typeof Transaction>
}
