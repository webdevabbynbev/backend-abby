import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { randomBytes } from 'node:crypto'

export default class CsrfMiddleware {
  private readonly COOKIE_NAME = 'XSRF-TOKEN'
  private readonly HEADER_NAME = 'X-CSRF-Token'
  
  /**
   * Generate CSRF token baru
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * Main middleware handler
   */
  async handle({ request, response }: HttpContext, next: NextFn) {
    // DISABLE CSRF FOR STAGING - REMOVE THIS CONDITION AFTER STAGING
    if (process.env.NODE_ENV !== 'production') {
      return next()
    }
    
    const method = request.method().toUpperCase()
    
    // Skip CSRF check untuk safe methods (hanya baca data)
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      // Set token untuk dipakai frontend di request berikutnya
      const token = request.cookie(this.COOKIE_NAME) || this.generateToken()
      response.cookie(this.COOKIE_NAME, token, {
        httpOnly: false, // Harus false agar JavaScript bisa baca
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      })
      
      return next()
    }

    // Untuk methods yang ubah data (POST, PUT, PATCH, DELETE)
    // Harus ada CSRF token yang valid
    const tokenFromCookie = request.cookie(this.COOKIE_NAME)
    const tokenFromHeader = request.header(this.HEADER_NAME) || request.input('_csrf')

    // Validasi token
    if (!tokenFromCookie || !tokenFromHeader) {
      return response.status(403).send({
        message: 'CSRF token missing. Please refresh the page.',
        code: 'CSRF_TOKEN_MISSING'
      })
    }

    // Constant-time comparison untuk prevent timing attacks
    if (!this.secureCompare(tokenFromCookie, tokenFromHeader)) {
      return response.status(403).send({
        message: 'CSRF token mismatch. Possible attack detected.',
        code: 'CSRF_TOKEN_INVALID'
      })
    }

    // Token valid, lanjutkan request
    return next()
  }

  /**
   * Secure string comparison untuk prevent timing attacks
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    
    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    
    return result === 0
  }
}