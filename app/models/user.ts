import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { afterFetch, afterFind, BaseModel, beforeSave, column, computed, hasMany, scope } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import router from '@adonisjs/core/services/router'
import PasswordReset from './password_resets.js'
import drive from '@adonisjs/drive/services/main'


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
  declare photoProfileUrl: string

  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: '1 days',
    prefix: 'oat_',
    table: 'auth_access_tokens',
    type: 'auth_token',
    tokenSecretLength: 40,
  })

  static readonly roleName = {
    1: 'Administrator',
    2: 'Guest',
    3: 'Gudang',
    4: 'Finance',
    5: 'Media',
  }

  @computed()
    public get role_name() {
      return User.roleName[this.role as keyof typeof User.roleName] ?? User.roleName[2]
    }

  @beforeSave()
  public static async hashUserPassword(user: User) {
    if (user.$dirty.password && !user.password.startsWith('$scrypt$')) {
      user.password = await hash.use('scrypt').make(user.password)
    }
  }

  public async sendVerificationEmail() {
    const appDomain = env.get('APP_URL')
    const appName = env.get('APP_TITLE')
    const currentYear = new Date().getFullYear()
    const url = router
      .builder()
      .params({ email: this.email })
      .prefixUrl(appDomain as string)
      .makeSigned('verifyEmail', { expiresIn: '24hours' })
    mail
      .send((message) => {
        message
          .from(env.get('DEFAULT_FROM_EMAIL') as string)
          .to(this.email)
          .subject('[Abby n Bev] Verifikasi Email')
          .htmlView('email_verification', {
            user: this,
            url,
            appName,
            appDomain,
            currentYear,
          })
      })
      .then(() => console.log('sukses terkirim'))
      .catch((err) => console.log(err))
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

  public async sendForgotPasswordEmail() {
  const appDomain = env.get('APP_URL') // Backend domain (API)
  const clientDomain = env.get('APP_CLIENT') || appDomain // Frontend domain (kalau ada)
  const appName = env.get('APP_TITLE')
  const currentYear = new Date().getFullYear()

  // Buat URL signed untuk verify
  const signedUrl = router
    .builder()
    .params({ email: this.email })
    .prefixUrl(appDomain as string)
    .makeSigned('verifyForgotPassword', { expiresIn: '24hours' })

  // Ambil token dari signed URL
  const urlObj = new URL(signedUrl)
  const signature = urlObj.searchParams.get('signature')

  // Kalau frontend belum ada → bikin link langsung ke form testing di Postman atau endpoint API reset-password
  const resetUrl = `${clientDomain}/reset-password?token=${signature}&email=${this.email}`

  await mail
    .send((message) => {
      message
        .from(env.get('DEFAULT_FROM_EMAIL') as string)
        .to(this.email)
        .subject('[Abby n Bev] Reset Password')
        .htmlView('emails/forgot', {
          user: this,
          url: resetUrl, // sekarang email pakai URL ini
          appName,
          appDomain,
          currentYear,
        })
    })
    .then(async () => {
      // Simpan token ke tabel password_resets
      const passwordReset = new PasswordReset()
      passwordReset.email = this.email
      passwordReset.token = signature as string
      await passwordReset.save()
    })
    .catch((err) => console.log(err))
  }

  public async getImageUrl() {
    this.photoProfileUrl = ''
    if (this.photoProfile) {
      this.photoProfileUrl = await drive.use(env.get('DRIVE_DISK')).getSignedUrl(this.photoProfile)
    }
  }

  // Scope untuk mengambil hanya data yang tidak terhapus
  public static active = scope((query) => {
    query.whereNull('deleted_at')
  })

  // Scope untuk mengambil hanya data yang sudah dihapus
  public static trashed = scope((query) => {
    query.whereNotNull('deleted_at')
  })

  // Soft delete method
  public async softDelete() {
    this.deletedAt = DateTime.now()
    await this.save()
  }

  // Restore method untuk mengembalikan data yang terhapus
  public async restore() {
    this.deletedAt = null
    await this.save()
  }

  

  @afterFetch()
  public static async getImageUrlAfterFetch(models: User[]) {
    for (const model of models) {
      await model.getImageUrl()
    }
  }

  @afterFind()
  public static async getImageUrlAfterFind(model: User) {
    await model.getImageUrl()
  }
}
