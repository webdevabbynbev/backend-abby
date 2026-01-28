import redis from '@adonisjs/redis/services/main'
import env from '#start/env'

/**
 * Authentication Rate Limiter
 * 
 * UNTUK APA:
 * Melindungi login endpoint dari brute force attack
 * 
 * APA ITU BRUTE FORCE ATTACK?
 * Attacker mencoba login berkali-kali dengan password berbeda sampai ketemu yang benar.
 * 
 * CONTOH SKENARIO TANPA RATE LIMITING:
 * 1. Attacker punya email: admin@abby.com
 * 2. Attacker coba 10,000 password populer:
 *    - password123 ❌
 *    - admin123 ❌
 *    - qwerty ❌
 *    - ... (ribuan percobaan dalam hitungan menit!)
 *    - abbyadmin2024 ✅ SUCCESS!
 * 3. Attacker berhasil masuk sebagai admin → full access!
 * 
 * KENAPA BAHAYA:
 * - Password bisa ketebak kalau user pakai password lemah
 * - Database overload dari ribuan query login
 * - Server bisa down dari spam requests
 * - Account takeover → data customer dicuri
 * 
 * CARA KERJA RATE LIMITER INI:
 * 1. Track berapa kali IP/email coba login
 * 2. Kalau gagal 5x dalam 15 menit → BLOCK
 * 3. User harus tunggu 15 menit baru bisa coba lagi
 * 4. Kalau berhasil login → counter direset
 * 
 * KENAPA PAKAI REDIS:
 * - Super cepat (in-memory database)
 * - Auto-expire keys (ga perlu cleanup manual)
 * - Bisa scale horizontal kalau ada multiple servers
 * 
 * IMPLEMENTASI:
 * - Max 5 failed attempts per 15 minutes per IP
 * - Max 5 failed attempts per 15 minutes per email
 * - Dual tracking untuk prevent bypass
 * 
 * DEVELOPMENT MODE:
 * - Set DISABLE_RATE_LIMIT=true di .env untuk bypass saat development
 * - Atau tambahkan IP kamu ke whitelist
 */

export class AuthRateLimiter {
  private readonly MAX_ATTEMPTS = 5
  private readonly WINDOW_MINUTES = 15
  private readonly BLOCK_MINUTES = 15
  
  // Whitelist IP untuk development (localhost + private networks)
  private readonly WHITELISTED_IPS = [
    '127.0.0.1',
    '::1',
    'localhost',
  ]
  
  /**
   * Check apakah rate limiting disabled atau IP di-whitelist
   */
  private isRateLimitingDisabled(ip: string): boolean {
    // Disable di development environment
    if (env.get('NODE_ENV') === 'development') {
      return true
    }
    
    // Check environment variable
    if (env.get('DISABLE_RATE_LIMIT') === 'true') {
      return true
    }
    
    // Check whitelist
    if (this.WHITELISTED_IPS.includes(ip)) {
      return true
    }
    
    return false
  }

  /**
   * Check apakah IP/email ini sudah kena rate limit
   * 
   * @returns { allowed: boolean, remainingAttempts: number, resetTime: Date | null }
   */
  async checkLimit(identifier: string, type: 'ip' | 'email'): Promise<{
    allowed: boolean
    remainingAttempts: number
    resetTime: Date | null
  }> {
    // Bypass rate limiting untuk development atau whitelisted IPs
    if (type === 'ip' && this.isRateLimitingDisabled(identifier)) {
      return {
        allowed: true,
        remainingAttempts: 999,
        resetTime: null
      }
    }
    
    const key = `auth:ratelimit:${type}:${identifier}`
    
    try {
      // Cek block status
      const blockKey = `${key}:blocked`
      const isBlocked = await redis.get(blockKey)
      
      if (isBlocked) {
        const ttl = await redis.ttl(blockKey)
        return {
          allowed: false,
          remainingAttempts: 0,
          resetTime: new Date(Date.now() + ttl * 1000)
        }
      }

      // Cek attempts count
      const attempts = await redis.get(key)
      const currentAttempts = attempts ? parseInt(attempts, 10) : 0

      if (currentAttempts >= this.MAX_ATTEMPTS) {
        // Block user
        await redis.setex(blockKey, this.BLOCK_MINUTES * 60, '1')
        return {
          allowed: false,
          remainingAttempts: 0,
          resetTime: new Date(Date.now() + this.BLOCK_MINUTES * 60 * 1000)
        }
      }

      return {
        allowed: true,
        remainingAttempts: this.MAX_ATTEMPTS - currentAttempts,
        resetTime: null
      }
    } catch (error) {
      // Kalau Redis error, allow request (fail-open)
      // Better daripada block semua user kalau Redis down
      console.error('Rate limiter error:', error)
      return {
        allowed: true,
        remainingAttempts: this.MAX_ATTEMPTS,
        resetTime: null
      }
    }
  }

  /**
   * Record failed login attempt
   */
  async recordFailedAttempt(identifier: string, type: 'ip' | 'email'): Promise<void> {
    const key = `auth:ratelimit:${type}:${identifier}`
    
    try {
      const attempts = await redis.get(key)
      const currentAttempts = attempts ? parseInt(attempts, 10) : 0
      
      await redis.setex(key, this.WINDOW_MINUTES * 60, (currentAttempts + 1).toString())
    } catch (error) {
      console.error('Failed to record attempt:', error)
    }
  }

  /**
   * Reset counter setelah successful login
   */
  async resetAttempts(identifier: string, type: 'ip' | 'email'): Promise<void> {
    const key = `auth:ratelimit:${type}:${identifier}`
    const blockKey = `${key}:blocked`
    
    try {
      await redis.del(key)
      await redis.del(blockKey)
    } catch (error) {
      console.error('Failed to reset attempts:', error)
    }
  }

  /**
   * Helper untuk format error message
   */
  getBlockedMessage(resetTime: Date): string {
    const minutes = Math.ceil((resetTime.getTime() - Date.now()) / 1000 / 60)
    return `Too many failed login attempts. Please try again in ${minutes} minute(s).`
  }
}

// Singleton instance
export const authRateLimiter = new AuthRateLimiter()
