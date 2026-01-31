import redis from '@adonisjs/redis/services/main'
import env from '#start/env'

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