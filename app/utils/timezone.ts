import { DateTime } from 'luxon'

/**
 * Timezone Utilities
 * Standardize timezone handling across the application
 */

export class TimezoneUtils {
  // Application timezone (adjust as needed)
  private static readonly APP_TIMEZONE = 'Asia/Jakarta'
  
  /**
   * Get current time in application timezone
   */
  static now(): DateTime {
    return DateTime.now().setZone(this.APP_TIMEZONE)
  }

  /**
   * Convert to application timezone
   */
  static toAppTimezone(date: DateTime | Date | string): DateTime {
    if (date instanceof Date) {
      return DateTime.fromJSDate(date).setZone(this.APP_TIMEZONE)
    }
    if (typeof date === 'string') {
      return DateTime.fromISO(date).setZone(this.APP_TIMEZONE)
    }
    return date.setZone(this.APP_TIMEZONE)
  }

  /**
   * Get SQL-compatible string in application timezone
   */
  static toSQLString(date?: DateTime): string {
    const dt = date || this.now()
    const sqlString = dt.toSQL({ includeOffset: false })
    return sqlString || dt.toISO() || ''
  }

  /**
   * Create cutoff time for comparisons
   */
  static createCutoff(options: {
    minutes?: number
    hours?: number
    days?: number
  }): Date {
    let dt = this.now()
    
    if (options.minutes) {
      dt = dt.minus({ minutes: options.minutes })
    }
    if (options.hours) {
      dt = dt.minus({ hours: options.hours })
    }
    if (options.days) {
      dt = dt.minus({ days: options.days })
    }
    
    return dt.toJSDate()
  }

  /**
   * Check if date is past cutoff
   */
  static isPast(date: DateTime | Date, cutoff: DateTime | Date): boolean {
    const dateTime = date instanceof Date ? DateTime.fromJSDate(date) : date
    const cutoffTime = cutoff instanceof Date ? DateTime.fromJSDate(cutoff) : cutoff
    
    return dateTime < cutoffTime
  }

  /**
   * Get difference in specified unit
   */
  static diff(
    start: DateTime | Date, 
    end: DateTime | Date, 
    unit: 'days' | 'hours' | 'minutes' | 'seconds' = 'days'
  ): number {
    const startTime = start instanceof Date ? DateTime.fromJSDate(start) : start
    const endTime = end instanceof Date ? DateTime.fromJSDate(end) : end
    
    return endTime.diff(startTime, unit)[unit]
  }

  /**
   * Format for display
   */
  static formatDisplay(date: DateTime | Date, format: string = 'dd MMM yyyy HH:mm'): string {
    const dt = date instanceof Date ? DateTime.fromJSDate(date) : date
    return dt.setZone(this.APP_TIMEZONE).toFormat(format)
  }

  /**
   * Check if within time window
   */
  static isWithinWindow(
    date: DateTime | Date,
    windowMinutes: number
  ): boolean {
    const dt = date instanceof Date ? DateTime.fromJSDate(date) : date
    const diff = this.now().diff(dt, 'minutes').minutes
    return diff <= windowMinutes
  }
}
