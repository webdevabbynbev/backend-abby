import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export enum ReferralUsageStatus {
  PENDING = 0,
  SUCCESS = 1,
  CANCELED = 2,
}

export default class ReferralUsage extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'referrer_user_id' })
  declare referrerUserId: number

  @column({ columnName: 'referee_user_id' })
  declare refereeUserId: number

  @column({ columnName: 'transaction_id' })
  declare transactionId: number

  @column()
  declare status: number

  @column({ columnName: 'reward_voucher_id' })
  declare rewardVoucherId: number | null

  @column({ columnName: 'reward_voucher_claim_id' })
  declare rewardVoucherClaimId: number | null

  @column.dateTime({ columnName: 'processed_at' })
  declare processedAt: DateTime | null

  @column.dateTime({ autoCreate: true, columnName: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, columnName: 'updated_at' })
  declare updatedAt: DateTime
}
