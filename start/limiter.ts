import limiter from '@adonisjs/limiter/services/main'

export const throttle10PerIp = limiter.define('throttle10PerIp', (ctx) => {
  const path = ctx.request.url().split('?')[0]
  const ipKey = `ip_${ctx.request.ip()}`

  // Midtrans webhook: longgarin supaya aman dari retry
  if (path.startsWith('/api/v1/midtrans')) {
    return limiter.allowRequests(120).every('1 minute').usingKey(`midtrans_${ipKey}`)
  }

  // Auth: lebih ketat (anti brute force)
  if (path.startsWith('/api/v1/auth')) {
    return limiter.allowRequests(8).every('1 minute').usingKey(`auth_${ipKey}`).blockFor('20 mins')
  }

  // Default: 10/min + hold
  return limiter.allowRequests(10).every('1 minute').usingKey(ipKey).blockFor('10 mins')
})
