import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import { ReportType, ReportPeriod, ReportStatus, ReportFormat, ReportChannel } from '#enums/report_types'

const jsonConsume = (value: any) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  // already object/array/number/etc
  return value
}

const jsonPrepare = (value: any) => {
  if (value === null || value === undefined) return null
  // Prefer keeping object for native JSON columns.
  // If you are on a DB that expects text JSON, stringifying is fine too.
  // This hybrid keeps both safe:
  if (typeof value === 'string') {
    // if already JSON string, keep it
    return value
  }
  return value
}

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
    prepare: jsonPrepare,
    consume: jsonConsume,
  })
  declare filters: Record<string, any> | null

  @column({
    prepare: jsonPrepare,
    consume: jsonConsume,
  })
  declare data: Record<string, any> | null

  @column({
    prepare: jsonPrepare,
    consume: jsonConsume,
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
