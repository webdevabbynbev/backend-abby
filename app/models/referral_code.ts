import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, scope } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import ReferralRedemption from '#models/referral_redemption'

export default class ReferralCode extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string

  @column({
    columnName: 'discount_percent',
    consume: (v) => (v === null || v === undefined ? 0 : Number(v)),
    prepare: (v) => (v === null || v === undefined ? 0 : Number(v)),
  })
  declare discountPercent: number

  @column({
    columnName: 'is_active',
    consume: (v) => Number(v) === 1,
    prepare: (v) => (v ? 1 : 0),
  })
  declare isActive: boolean

  @column.dateTime({ columnName: 'started_at' })
  declare startedAt: DateTime | null

  @column.dateTime({ columnName: 'expired_at' })
  declare expiredAt: DateTime | null

  @column({ columnName: 'max_uses_total' })
  declare maxUsesTotal: number | null

  @column({ columnName: 'max_uses_per_user' })
  declare maxUsesPerUser: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime({ columnName: 'deleted_at' })
  declare deletedAt: DateTime | null

  public static active = scope((q) => q.whereNull('referral_codes.deleted_at'))

  @hasMany(() => ReferralRedemption, { foreignKey: 'referralCodeId' })
  declare redemptions: HasMany<typeof ReferralRedemption>
}
