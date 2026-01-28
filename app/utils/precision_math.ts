/**
 * Precision Math Utilities
 * Handle floating point arithmetic precisely for financial calculations
 */

export class PrecisionMath {
  /**
   * Multiply with precision (for price * quantity)
   */
  static multiply(a: number, b: number, decimals: number = 2): number {
    const multiplier = Math.pow(10, decimals)
    return Math.round(a * multiplier * b) / multiplier
  }

  /**
   * Add with precision
   */
  static add(a: number, b: number, decimals: number = 2): number {
    const multiplier = Math.pow(10, decimals)
    return Math.round((a * multiplier + b * multiplier)) / multiplier
  }

  /**
   * Subtract with precision
   */
  static subtract(a: number, b: number, decimals: number = 2): number {
    const multiplier = Math.pow(10, decimals)
    return Math.round((a * multiplier - b * multiplier)) / multiplier
  }

  /**
   * Divide with precision
   */
  static divide(a: number, b: number, decimals: number = 2): number {
    if (b === 0) throw new Error('Division by zero')
    const multiplier = Math.pow(10, decimals)
    return Math.round((a / b) * multiplier) / multiplier
  }

  /**
   * Round to specific decimal places
   */
  static round(value: number, decimals: number = 2): number {
    const multiplier = Math.pow(10, decimals)
    return Math.round(value * multiplier) / multiplier
  }

  /**
   * Calculate amount with proper precision (price * quantity - discount)
   */
  static calculateAmount(
    price: number, 
    quantity: number, 
    discount: number = 0,
    decimals: number = 2
  ): number {
    const subtotal = this.multiply(price, quantity, decimals)
    const totalDiscount = this.multiply(discount, quantity, decimals)
    return this.subtract(subtotal, totalDiscount, decimals)
  }

  /**
   * Calculate percentage with precision
   */
  static percentage(value: number, percent: number, decimals: number = 2): number {
    return this.multiply(value, percent / 100, decimals)
  }

  /**
   * Safe comparison for monetary values
   */
  static isEqual(a: number, b: number, tolerance: number = 0.01): boolean {
    return Math.abs(a - b) < tolerance
  }

  /**
   * Format to fixed decimal without trailing zeros
   */
  static toFixed(value: number, decimals: number = 2): string {
    return parseFloat(value.toFixed(decimals)).toString()
  }
}