import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { randomBytes } from 'node:crypto'

/**
 * CSRF Protection Middleware
 * 
 * UNTUK APA:
 * Melindungi aplikasi dari CSRF (Cross-Site Request Forgery) attack.
 * 
 * APA ITU CSRF ATTACK?
 * Contoh skenario:
 * 1. User login ke website kamu (abby.com), dapat cookie session
 * 2. User buka website jahat (evil.com) di tab lain (cookie masih aktif!)
 * 3. Website jahat punya form tersembunyi yang submit ke abby.com/api/admin/delete-product
 * 4. Browser otomatis kirim cookie session kamu → request berhasil!
 * 5. Product terhapus tanpa sepengetahuan user!
 * 
 * KENAPA BAHAYA:
 * - Attacker bisa jalankan action atas nama user yang login
 * - Bisa delete data, ubah password, transfer uang, dll
 * - User ga sadar karena terjadi di background
 * 
 * CARA KERJA MIDDLEWARE INI:
 * 1. Generate random CSRF token untuk setiap session
 * 2. Frontend harus kirim token ini di header X-CSRF-Token
 * 3. Middleware cek: token dari header == token di cookie?
 * 4. Kalau cocok → request valid, lanjutkan
 * 5. Kalau ga cocok → reject request (403 Forbidden)
 * 
 * KAPAN AKTIF:
 * Cuma untuk request yang mengubah data (POST, PUT, PATCH, DELETE)
 * GET request ga perlu CSRF token (karena cuma baca data)
 * 
 * NOTE: Untuk API-only backend (seperti ini), CSRF kurang relevan karena:
 * - Frontend biasanya pakai Bearer token di header (bukan cookie)
 * - Same-origin policy browser sudah protect
 * - Tapi tetap good practice kalau pakai cookie-based auth
 */

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
