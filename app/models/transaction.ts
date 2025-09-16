import { DateTime } from 'luxon'
import { BaseModel, column, hasOne, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { HasOne, BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import TransactionEcommerce from '#models/transaction_ecommerce'
import TransactionPos from '#models/transaction_pos'
import User from '#models/user'
import TransactionDetail from '#models/transaction_detail'
import TransactionShipment from '#models/transaction_shipment'

export default class Transaction extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare transactionNumber: string

  @column()
  declare amount: number

  @column()
  declare discount: number

  @column()
  declare discountType: number

  @column()
  declare subTotal: number

  @column()
  declare grandTotal: number

  @column()
  declare paymentStatus: string

  @column()
  declare channel: 'ecommerce' | 'pos'

  @column()
  declare userId: number

  @column()
  declare note: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @hasMany(() => TransactionDetail)
  declare details: HasMany<typeof TransactionDetail>

  @hasMany(() => TransactionShipment)
  declare shipments: HasMany<typeof TransactionShipment>

  // 🔗 Relasi ke User
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  // 🔗 Relasi ke transaksi ecommerce
  @hasOne(() => TransactionEcommerce)
  declare ecommerce: HasOne<typeof TransactionEcommerce>

  // 🔗 Relasi ke transaksi POS
  @hasOne(() => TransactionPos)
  declare pos: HasOne<typeof TransactionPos>
}
