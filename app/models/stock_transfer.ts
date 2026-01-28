import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import ProductVariant from './product_variant.js'

export enum StockTransferStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  COMPLETED = 'completed',
  REJECTED = 'rejected'
}

export default class StockTransfer extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare productVariantId: number

  @column()
  declare fromChannel: string

  @column()
  declare toChannel: string

  @column()
  declare quantity: number

  @column()
  declare status: StockTransferStatus

  @column()
  declare note: string | null

  @column()
  declare requestedBy: string | null

  @column()
  declare approvedBy: string | null

  @column.dateTime()
  declare requestedAt: DateTime

  @column.dateTime()
  declare approvedAt: DateTime | null

  @column.dateTime()
  declare completedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => ProductVariant)
  declare variant: BelongsTo<typeof ProductVariant>

  /**
   * Approve transfer request
   */
  public async approve(approvedBy: string): Promise<void> {
    this.status = StockTransferStatus.APPROVED
    this.approvedBy = approvedBy
    this.approvedAt = DateTime.now()
    await this.save()
  }

  /**
   * Complete transfer (after physical stock moved)
   */
  public async complete(): Promise<void> {
    this.status = StockTransferStatus.COMPLETED
    this.completedAt = DateTime.now()
    await this.save()
  }

  /**
   * Reject transfer request
   */
  public async reject(rejectedBy: string, reason?: string): Promise<void> {
    this.status = StockTransferStatus.REJECTED
    this.approvedBy = rejectedBy
    this.approvedAt = DateTime.now()
    if (reason) this.note = (this.note ? this.note + '\n' : '') + `Rejected: ${reason}`
    await this.save()
  }
}