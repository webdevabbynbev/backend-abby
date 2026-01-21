import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Transaction from '#models/transaction'
import Voucher from '#models/voucher'
import UserAddress from '#models/user_address'
import User from '#models/user'
import TransactionShipment from '#models/transaction_shipment'

export default class TransactionEcommerce extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'transaction_id' })
  declare transactionId: number

  @column({ columnName: 'user_id' })
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

  @column({ columnName: 'user_addresses_id' })
  declare userAddressId: number | null

  @column({ columnName: 'voucher_id' })
  declare voucherId: number | null

  // ✅ NEW: auto discount applied
  @column({ columnName: 'discount_id' })
  declare discountId: number | null

  @column({ columnName: 'discount_code' })
  declare discountCode: string | null

  @column({
    columnName: 'discount_amount',
    consume: (v) => (v === null || v === undefined ? 0 : Number(v)),
    prepare: (v) => (v === null || v === undefined ? 0 : Number(v)),
  })
  declare discountAmount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Transaction)
  declare transaction: BelongsTo<typeof Transaction>

  @belongsTo(() => Voucher)
  declare voucher: BelongsTo<typeof Voucher>

  @belongsTo(() => UserAddress, {
    foreignKey: 'userAddressId',
  })
  declare userAddress: BelongsTo<typeof UserAddress>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => TransactionShipment, {
    foreignKey: 'transactionId',
  })
  declare shipments: HasMany<typeof TransactionShipment>

  @column({ columnName: 'referral_code_id' })
  declare referralCodeId: number | null

  @column({ columnName: 'referral_code' })
  declare referralCode: string | null

  @column({
    columnName: 'referral_discount_percent',
    consume: (v) => (v === null || v === undefined ? 0 : Number(v)),
    prepare: (v) => (v === null || v === undefined ? 0 : Number(v)),
  })
  declare referralDiscountPercent: number

  @column({
    columnName: 'referral_discount_amount',
    consume: (v) => (v === null || v === undefined ? 0 : Number(v)),
    prepare: (v) => (v === null || v === undefined ? 0 : Number(v)),
  })
  declare referralDiscountAmount: number
}