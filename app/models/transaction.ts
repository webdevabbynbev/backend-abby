import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import User from './user.js'
import UserAddress from './user_address.js'
import Voucher from './voucher.js'
import TransactionCart from './transaction_cart.js'
import TransactionDetail from './transaction_detail.js'
import TransactionShipment from './transaction_shipment.js'
import { computed } from '@adonisjs/lucid/orm'
import { TransactionStatus } from '../enums/transaction_status.js'

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
  declare ppn: number

  @column()
  declare shippingCost: number

  @column()
  declare subTotal: number

  @column()
  declare status: number

  @column()
  declare tokenMidtrans: string | null

  @column()
  declare redirectUrl: string | null

  @column()
  declare paymentMethod: string | null

  // Foreign keys
  @column()
  declare userId: number

  @column({ columnName: 'user_addresses_id' })
  declare userAddressId: number | null

  @column()
  declare voucherId: number | null

  // Timestamps
  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @computed()
  public get statusLabel() {
    switch (this.status) {
      case TransactionStatus.WAITING_PAYMENT:
        return 'Waiting Payment'
      case TransactionStatus.ON_PROCESS:
        return 'On Process'
      case TransactionStatus.ON_DELIVERY:
        return 'On Delivery'
      case TransactionStatus.COMPLETED:
        return 'Completed'
      case TransactionStatus.FAILED:
        return 'Failed'
      default:
        return 'Unknown'
    }
  }

  // ===================== RELATIONS =====================

  @hasMany(() => TransactionDetail, {
    foreignKey: 'transactionId',
  })
  declare detail: HasMany<typeof TransactionDetail>

  @hasOne(() => TransactionShipment, {
    foreignKey: 'transactionId',
  })
  declare shipment: HasOne<typeof TransactionShipment>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => UserAddress, {
    foreignKey: 'userAddressId',
  })
  declare address: BelongsTo<typeof UserAddress>

  @belongsTo(() => Voucher)
  declare voucher: BelongsTo<typeof Voucher>

  @hasMany(() => TransactionCart)
  declare carts: HasMany<typeof TransactionCart>

  public async sendTransactionEmail(
    user: { email: string; name: string },
    status: string,
    template: string,
    isAdmin: boolean = false
  ) {
    const appDomain = env.get('APP_LANDING')
    const currentYear = new Date().getFullYear()
    mail
      .send((message) => {
        message
          .from(env.get('DEFAULT_FROM_EMAIL') as string)
          .to(
            isAdmin ? (env.get('SMTP_USERNAME') as string) : user.email,
            isAdmin ? 'ABBYNBEV' : user.name
          )
          .subject(`[ABBY N BEV] Transaction ${status}`)
          .htmlView(template, {
            transaction: this,
            user,
            appDomain,
            currentYear,
          })
      })
      .then(() => console.log('sukses terkirim'))
      .catch((err) => console.log(err))
  }
}
