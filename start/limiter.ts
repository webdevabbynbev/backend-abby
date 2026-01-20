import limiter from '@adonisjs/limiter/services/main'

export const throttle10PerIp = limiter.define('throttle10PerIp', (ctx) => {
  const ipKey = `auth_ip_${ctx.request.ip()}`

  return limiter
    .allowRequests(10)
    .every('1 minute')
    .usingKey(ipKey)
    .blockFor('30 secs')
})

export const throttleWebhookSafetyValve = limiter.define('throttleWebhookSafetyValve', (ctx) => {
  const ip = ctx.request.header('x-forwarded-for')?.split(',')[0]?.trim() || ctx.request.ip()
  const path = ctx.request.url().split('?')[0]

  const keyPrefix = path.startsWith('/api/v1/midtrans')
    ? 'midtrans'
    : path.startsWith('/api/v1/biteship')
      ? 'biteship'
      : 'webhook'

  return limiter
    .allowRequests(2000)     // super longgar: 2000/min per IP
    .every('1 minute')
    .usingKey(`${keyPrefix}_ip_${ip}`)
    .blockFor('30 secs')
})
