// start/swagger.ts
import router from '@adonisjs/core/services/router'
import AutoSwagger from 'adonis-autoswagger'
import swaggerConfig from '#config/swagger'

/**
 * PATCH: ensure requestBody has schema so Swagger UI shows JSON editor
 */
const kebabToCamel = (s: string) => s.replace(/-([a-z])/g, (_, c) => String(c).toUpperCase())

const inferSchemaKey = (op: any, pathKey: string): string | null => {
  if (typeof op?.operationId === 'string' && op.operationId) return op.operationId

  const text = `${op?.summary ?? ''} ${op?.description ?? ''}`
  const m = text.match(/\*\*([A-Za-z0-9_]+)\*\*/g)
  if (m?.length) return m[m.length - 1].replace(/\*\*/g, '')

  const seg = String(pathKey).split('?')[0].split('/').filter(Boolean).pop()
  if (!seg) return null
  return kebabToCamel(seg)
}

const patchRequestBodies = (spec: any) => {
  const schemas = spec?.components?.schemas || {}
  const paths = spec?.paths || {}

  for (const pathKey of Object.keys(paths)) {
    const pathItem = paths[pathKey]
    if (!pathItem || typeof pathItem !== 'object') continue

    for (const method of Object.keys(pathItem)) {
      const op = (pathItem as any)[method]
      if (!op || typeof op !== 'object') continue

      const rb = op.requestBody
      const appJson = rb?.content?.['application/json']
      if (!rb || !appJson) continue

      if (appJson.schema) continue

      const key = inferSchemaKey(op, pathKey)

      if (key && schemas[key]) {
        appJson.schema = { $ref: `#/components/schemas/${key}` }
        if (schemas[key]?.example && !appJson.example) appJson.example = schemas[key].example
        rb.required = rb.required ?? true
        continue
      }

      appJson.schema = { type: 'object' }
      appJson.example = appJson.example ?? {}
      rb.required = rb.required ?? true
    }
  }

  return spec
}

/**
 * Routes
 * - JSON spec: /swagger.json
 * - UI: /docs
 */
router.get('/swagger.json', async ({ response }) => {
  const spec = AutoSwagger.docs(router.toJSON(), swaggerConfig)
  const patched = patchRequestBodies(spec)

  response.type('application/json')
  response.send(patched)
})

router.get('/swagger', async ({ response }) => {
  response.redirect('/docs')
})

router.get('/docs', async ({ response }) => {
  // UI akan fetch spec dari /swagger.json
  return response.send(AutoSwagger.ui('/swagger.json', swaggerConfig))
})

/**
 * IMPORTANT:
 * Jangan bikin router.get('/') redirect di file ini,
 * karena bisa “nabrak” route homepage kamu yang lain.
 */
