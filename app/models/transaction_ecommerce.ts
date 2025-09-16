import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasOne } from '@adonisjs/lucid/types/relations'
import Transaction from '#models/transaction'
import Voucher from '#models/voucher'
import UserAddress from '#models/user_address'
import User from '#models/user'
import TransactionShipment from '#models/transaction_shipment'

export default class TransactionEcommerce extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare transactionId: number

  @column()
  declare userId: number

  @column()
  declare ppn: number

  @column()
  declare shippingCost: number

  @column()
  declare courierName: string | null

  @column()
  declare courierService: string | null

  @column()
  declare tokenMidtrans: string | null

  @column()
  declare redirectUrl: string | null

  @column()
  declare paymentMethod: string | null

  @column()
  declare receipt: string | null

  @column()
  declare userAddressesId: number | null

  @column()
  declare voucherId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // 🔗 Relasi ke Transaction
  @belongsTo(() => Transaction)
  declare transaction: BelongsTo<typeof Transaction>

  // 🔗 Relasi ke Voucher
  @belongsTo(() => Voucher)
  declare voucher: BelongsTo<typeof Voucher>

  // 🔗 Relasi ke UserAddress
  @belongsTo(() => UserAddress)
  declare userAddress: BelongsTo<typeof UserAddress>

  // 🔗 Relasi ke User
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasOne(() => TransactionShipment)
  declare shipment: HasOne<typeof TransactionShipment>
}
