import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import { ReportType, ReportPeriod, ReportStatus, ReportFormat, ReportChannel } from '#enums/report_types'

export default class Report extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  // Report metadata
  @column()
  declare reportNumber: string

  @column()
  declare title: string

  @column()
  declare description: string | null

  // Report type and configuration
  @column()
  declare reportType: ReportType

  @column()
  declare reportPeriod: ReportPeriod

  @column()
  declare reportFormat: ReportFormat

  @column()
  declare channel: ReportChannel

  // Date range
  @column.dateTime()
  declare startDate: DateTime

  @column.dateTime()
  declare endDate: DateTime

  // Report status
  @column()
  declare status: ReportStatus

  // Report data and file
  @column({
    prepare: (value: any) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare filters: Record<string, any> | null

  @column({
    prepare: (value: any) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare data: Record<string, any> | null

  @column({
    prepare: (value: any) => JSON.stringify(value),
    consume: (value: string) => JSON.parse(value),
  })
  declare summary: Record<string, any> | null

  @column()
  declare filePath: string | null

  @column()
  declare fileUrl: string | null

  // User who requested the report
  @column()
  declare userId: number

  // Processing info
  @column.dateTime()
  declare generatedAt: DateTime | null

  @column()
  declare errorMessage: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null

  // Relationships
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  // Helper methods
  public isCompleted(): boolean {
    return this.status === ReportStatus.COMPLETED
  }

  public isFailed(): boolean {
    return this.status === ReportStatus.FAILED
  }

  public isProcessing(): boolean {
    return this.status === ReportStatus.PROCESSING
  }

  public isPending(): boolean {
    return this.status === ReportStatus.PENDING
  }
}
