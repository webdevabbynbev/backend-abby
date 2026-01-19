import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ReferralCode from '#models/referral_code'
import User from '#models/user'
import Transaction from '#models/transaction'

export enum ReferralRedemptionStatus {
  PENDING = 0,
  SUCCESS = 1,
  CANCELED = 2,
}

export default class ReferralRedemption extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'referral_code_id' })
  declare referralCodeId: number | null

  @column({ columnName: 'referral_code' })
  declare referralCode: string

  @column({
    columnName: 'discount_percent',
    consume: (v) => (v === null || v === undefined ? 0 : Number(v)),
    prepare: (v) => (v === null || v === undefined ? 0 : Number(v)),
  })
  declare discountPercent: number

  @column({
    columnName: 'discount_amount',
    consume: (v) => (v === null || v === undefined ? 0 : Number(v)),
    prepare: (v) => (v === null || v === undefined ? 0 : Number(v)),
  })
  declare discountAmount: number

  @column({ columnName: 'user_id' })
  declare userId: number

  @column({ columnName: 'transaction_id' })
  declare transactionId: number

  @column()
  declare status: number

  @column.dateTime({ columnName: 'processed_at' })
  declare processedAt: DateTime | null

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime

  @belongsTo(() => ReferralCode, { foreignKey: 'referralCodeId' })
  declare codeRef: BelongsTo<typeof ReferralCode>

  @belongsTo(() => User, { foreignKey: 'userId' })
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Transaction, { foreignKey: 'transactionId' })
  declare transaction: BelongsTo<typeof Transaction>
}
