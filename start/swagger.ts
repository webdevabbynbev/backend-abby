import * as AutoSwaggerModule from 'adonis-autoswagger'
import swaggerUi from 'swagger-ui-express'
import router from '@adonisjs/core/services/router'
import swaggerConfig from '#config/swagger'

const resolveSwaggerDocs = () => {
  const candidates: unknown[] = []
  const seen = new Set<unknown>()
  let current: unknown = AutoSwaggerModule

  while (
    current &&
    (typeof current === 'object' || typeof current === 'function') &&
    !seen.has(current)
  ) {
    candidates.push(current)
    seen.add(current)

    if ('default' in (current as { default?: unknown })) {
      current = (current as { default?: unknown }).default
    } else {
      break
    }
  }

  const maybeResolveDocs = (target: unknown) => {
    if (!target) {
      return null
    }

    if (typeof (target as { docs?: unknown }).docs === 'function') {
      return (target as { docs: (routes: unknown, config: typeof swaggerConfig) => unknown }).docs(
        router.toJSON(),
        swaggerConfig
      )
    }

    if (typeof target === 'function') {
      const autoSwaggerFn = target as (routes: unknown, config: typeof swaggerConfig) => unknown
      return autoSwaggerFn(router.toJSON(), swaggerConfig)
    }

    if (
      typeof (target as { prototype?: { docs?: unknown } }).prototype?.docs === 'function'
    ) {
      const instance = new (target as new () => { docs: (routes: unknown, config: typeof swaggerConfig) => unknown })()
      return instance.docs(router.toJSON(), swaggerConfig)
    }

    return null
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const directDocs = maybeResolveDocs(candidate)
    if (directDocs) {
      return directDocs
    }

    if (typeof (candidate as { default?: unknown }).default !== 'undefined') {
      const defaultDocs = maybeResolveDocs((candidate as { default?: unknown }).default)
      if (defaultDocs) {
        return defaultDocs
      }
    }

    if (typeof (candidate as { AutoSwagger?: unknown }).AutoSwagger !== 'undefined') {
      const namedDocs = maybeResolveDocs((candidate as { AutoSwagger?: unknown }).AutoSwagger)
      if (namedDocs) {
        return namedDocs
      }
    }
  }

  throw new Error('AutoSwagger docs generator is unavailable')
}

router.get('/swagger.json', async () => resolveSwaggerDocs())

router.get('/swagger', async ({ response }) => {
  response.redirect('/docs')
})

router.get('/', async ({ response }) => {
  response.redirect('/docs')
})

router.get('/docs', async ({ response }) => {
  const swaggerDocs = resolveSwaggerDocs()
  const html = swaggerUi.generateHTML(swaggerDocs)
  response.type('text/html')
  response.send(html)
})