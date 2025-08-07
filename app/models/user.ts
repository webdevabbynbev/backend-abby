import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, computed } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'


const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'first_name' })
  declare firstName: string | null

  @column({ columnName: 'last_name' })
  declare lastName: string | null

  @column()
  declare email: string

  @column()
  declare phone: string | null

  @column({ columnName: 'phone_number' })
  declare phoneNumber: string | null

  @column()
  declare emailVerified: number | null

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare rememberMeToken: string | null

  @column({ columnName: 'is_active' })
  declare isActive: number | null

  @column()
  declare role: number | null

  @column({ columnName: 'photo_profile' })
  declare photoProfile: string | null

  @column()
  declare dob: Date | null

  @column()
  declare gender: number | null

  @column()
  declare address: string | null

  @column()
  declare googleId: string | null

  @column({ columnName: 'created_by' })
  declare createdBy: number | null

  @column({ columnName: 'updated_by' })
  declare updatedBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @column.dateTime()
  declare deletedAt: DateTime | null

  @computed({ serializeAs: 'photo_profile_url' })
  public get photoProfileUrl(): string | null {
    return this.photoProfile ? `/uploads/${this.photoProfile}` : null
  }

  public static async findWithSoftDelete(id: number | string, trx?: TransactionClientContract) {
    if (trx) {
      return this.query({ client: trx }).where('id', id).whereNull('deleted_at').first()
    }

    return this.query().where('id', id).whereNull('deleted_at').first()
  }

  public static async findColumnWithSoftDelete(
    column: string,
    id: number | string,
    trx?: TransactionClientContract
  ) {
    if (trx) {
      return this.query({ client: trx }).where(column, id).whereNull('deleted_at').first()
    }
    return this.query().where(column, id).whereNull('deleted_at').first()
  }

  public async softDelete() {
    this.deletedAt = DateTime.now()
    await this.save()
  }

  public async restore() {
    this.deletedAt = null
    await this.save()
  }

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: '1 days',
    prefix: 'oat_',
    table: 'auth_access_tokens',
    type: 'auth_token',
    tokenSecretLength: 40,
  })
}
