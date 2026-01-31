import limiter from '@adonisjs/limiter/services/main'

export const throttle10PerIp = limiter.define('throttle10PerIp', (ctx) => {
  const ipKey = `auth_ip_${ctx.request.ip()}`

  return limiter
    .allowRequests(1000) // DISABLED: Increased to 1000 requests per minute for staging
    .every('1 minute')
    .usingKey(ipKey)
    .blockFor('1 secs') // Reduced block time
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
    .allowRequests(2000) // 2000 request / menit / IP
    .every('1 minute')
    .usingKey(`${keyPrefix}_ip_${ip}`)
    .blockFor('30 secs')
})