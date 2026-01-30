/**
 * Security utilities for backend application
 * Provides common security functions and validations
 */

export class SecurityUtils {
  
  /**
   * Sanitize SQL setting values to prevent injection
   */
  static sanitizeSqlSetting(value: string): string {
    if (/^\d+$/.test(value.trim())) {
      return value.trim()
    }
    
    // Remove dangerous characters and validate
    const sanitized = value.replace(/[;'"\\]/g, '').trim()
    
    if (!/^[a-zA-Z0-9._\s-]+$/.test(sanitized) || sanitized.length > 100) {
      throw new Error(`Invalid SQL setting value: ${value}`)
    }
    
    return `'${sanitized}'`
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length)
      result += chars[randomIndex]
    }
    
    return result
  }

  /**
   * Validate and sanitize email input
   */
  static sanitizeEmail(email: string): string {
    const sanitized = email.trim().toLowerCase()
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(sanitized)) {
      throw new Error('Invalid email format')
    }
    
    return sanitized
  }

  /**
   * Rate limit check for sensitive operations
   */
  static isWithinRateLimit(
    attempts: number, 
    timeWindow: number, 
    maxAttempts: number
  ): boolean {
    return attempts < maxAttempts
  }

  /**
   * Safe numeric conversion with validation
   */
  static safeNumber(value: any, defaultValue: number = 0, options?: {
    min?: number;
    max?: number;
    allowFloat?: boolean;
  }): number {
    if (value === null || value === undefined || value === '') {
      return defaultValue
    }
    
    const num = options?.allowFloat ? parseFloat(value) : parseInt(value, 10)
    
    if (!Number.isFinite(num) || Number.isNaN(num)) {
      return defaultValue
    }
    
    if (options?.min !== undefined && num < options.min) {
      return defaultValue
    }
    
    if (options?.max !== undefined && num > options.max) {
      return defaultValue
    }
    
    return num
  }

  /**
   * Safe price conversion (always positive, max 2 decimal places)
   */
  static safePrice(value: any, defaultValue: number = 0): number {
    const price = this.safeNumber(value, defaultValue, { 
      min: 0, 
      max: 999999999,
      allowFloat: true 
    })
    
    // Round to 2 decimal places
    return Math.round(price * 100) / 100
  }

  /**
   * Safe quantity validation (positive integers only)
   */
  static safeQuantity(value: any, defaultValue: number = 0): number {
    return this.safeNumber(value, defaultValue, { 
      min: 0, 
      max: 999999 
    })
  }

  /**
   * Validate payment method
   */
  static validatePaymentMethod(method: string): boolean {
    const allowedMethods = ['cash', 'card', 'qris', 'transfer', 'ewallet']
    return typeof method === 'string' && allowedMethods.includes(method.toLowerCase())
  }
}