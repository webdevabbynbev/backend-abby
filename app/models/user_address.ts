import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import TransactionEcommerce from '#models/transaction_ecommerce'
import Province from '#models/province'
import City from '#models/city'
import District from '#models/district'
import SubDistrict from '#models/sub_district'

export default class UserAddress extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare address: string

  @column()
  declare picName: string

  @column()
  declare picPhone: string

  @column()
  declare picLabel: string

  @column()
  declare isActive: number

  @column()
  declare city: number

  @column()
  declare province: number

  @column()
  declare district: number

  @column()
  declare subDistrict: number

  @column()
  declare postalCode: string

  @column()
  declare benchmark: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => TransactionEcommerce, {
    foreignKey: 'userAddressesId',
  })
  declare transactions: HasMany<typeof TransactionEcommerce>

  @belongsTo(() => Province, { foreignKey: 'province' })
  declare provinceData: BelongsTo<typeof Province>

  @belongsTo(() => City, { foreignKey: 'city' })
  declare cityData: BelongsTo<typeof City>

  @belongsTo(() => District, { foreignKey: 'district' })
  declare districtData: BelongsTo<typeof District>

  @belongsTo(() => SubDistrict, { foreignKey: 'subDistrict' })
  declare subDistrictData: BelongsTo<typeof SubDistrict>
}
