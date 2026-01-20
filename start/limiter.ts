import limiter from '@adonisjs/limiter/services/main'

export const throttle10PerIp = limiter.define('throttle10PerIp', (ctx) => {
  const path = ctx.request.url().split('?')[0]
  const ipKey = `ip_${ctx.request.ip()}`

  // Midtrans webhook: longgarin supaya aman dari retry
  if (path.startsWith('/api/v1/midtrans')) {
    return limiter.allowRequests(10000).every('1 minute').usingKey(`midtrans_${ipKey}`)
  }

  // Biteship webhook: longgarin supaya aman dari retry
  if (path.startsWith('/api/v1/biteship')) {
    return limiter.allowRequests(10000).every('1 minute').usingKey(`biteship_${ipKey}`)
  }

  // Auth: lebih ketat (anti brute force) + block lebih lama
  if (path.startsWith('/api/v1/auth')) {
    return limiter.allowRequests(10000).every('1 minute').usingKey(`auth_${ipKey}`).blockFor('10 mins')
  }

  // Default: 10/min + hold 1 menit
  return limiter.allowRequests(10000).every('1 minute').usingKey(ipKey).blockFor('1 min')
})
