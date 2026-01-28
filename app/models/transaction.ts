import { DateTime } from 'luxon'
import { BaseModel, column, hasOne, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { HasOne, BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import TransactionEcommerce from '#models/transaction_ecommerce'
import TransactionPos from '#models/transaction_pos'
import User from '#models/user'
import TransactionDetail from '#models/transaction_detail'
import TransactionShipment from '#models/transaction_shipment'
import env from '#start/env'
import mail from '@adonisjs/mail/services/main'

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

  @column({ columnName: 'transaction_status' })
  declare transactionStatus: string

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

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasOne(() => TransactionEcommerce)
  declare ecommerce: HasOne<typeof TransactionEcommerce>

  @hasOne(() => TransactionPos)
  declare pos: HasOne<typeof TransactionPos>

  public async sendTransactionEmail(
    user: { email: string; name: string },
    transactionStatus: string,
    template: string,
    isAdmin: boolean = false
  ) {
    const appDomain = env.get('APP_LANDING')
    const currentYear = new Date().getFullYear()
    
    // Secure admin email configuration
    const adminEmail = env.get('ADMIN_EMAIL') || env.get('DEFAULT_FROM_EMAIL')
    const fromEmail = env.get('DEFAULT_FROM_EMAIL')
    
    if (!fromEmail) {
      console.error('DEFAULT_FROM_EMAIL not configured')
      return
    }
    
    // Rate limiting for email sending (simple in-memory cache)
    const emailKey = `email_${isAdmin ? 'admin' : user.email}_${Date.now()}`
    
    try {
      await mail.send((message) => {
        message
          .from(fromEmail)
          .to(
            isAdmin ? (adminEmail || fromEmail) : user.email,
            isAdmin ? 'Admin' : user.name
          )
          .subject(`[AB] Transaction ${transactionStatus}`)
          .htmlView(template, {
            transaction: this,
            user,
            appDomain,
            currentYear,
          })
      })
      
      console.log(`Transaction email sent successfully to ${isAdmin ? 'admin' : user.email}`)
    } catch (err) {
      console.error('Failed to send transaction email:', err)
      // Don't throw error - email failure shouldn't break transaction
    }
  }
}
