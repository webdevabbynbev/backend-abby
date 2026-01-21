import * as AutoSwaggerModule from 'adonis-autoswagger'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import router from '@adonisjs/core/services/router'
import swaggerConfig from '#config/swagger'

type CustomPaths = Record<string, string>

let cachedCustomPaths: CustomPaths | null = null

const normalizeImportPath = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const candidate = record.types ?? record.default
    if (typeof candidate === 'string') {
      return candidate
    }
  }

  return null
}

const buildCustomPaths = async (): Promise<CustomPaths> => {
  if (cachedCustomPaths) {
    return cachedCustomPaths
  }

  try {
    const appRoot = path.resolve((swaggerConfig as any).path ?? process.cwd())
    const packageJson = await readFile(path.join(appRoot, 'package.json'), 'utf8')
    const { imports } = JSON.parse(packageJson) as { imports?: Record<string, unknown> }

    if (!imports) {
      cachedCustomPaths = {}
      return cachedCustomPaths
    }

    const entries = Object.entries(imports).flatMap(([key, value]) => {
      const normalized = normalizeImportPath(value)
      if (!normalized) {
        return []
      }

      // "#controllers/*" -> "#controllers"
      const moduleKey = key.replace(/\/\*$/, '')

      // "./app/controllers/*.ts" -> "app/controllers"
      const modulePath = normalized
        .replace(/\/\*\.js$/, '')
        .replace(/\/\*\.ts$/, '')
        .replace(/\/\*$/, '')
        .replace(/^\.\//, '')

      // buat 2 varian key biar kebal: "#controllers" dan "#controllers/"
      return [
        [moduleKey, modulePath],
        [`${moduleKey}/`, modulePath],
      ] as const
    })

    cachedCustomPaths = Object.fromEntries(entries)
    return cachedCustomPaths
  } catch {
    cachedCustomPaths = {}
    return cachedCustomPaths
  }
}

const resolveSwaggerDocs = async (): Promise<unknown> => {
  const customPaths = await buildCustomPaths()

  const attachCustomPaths = (target: any) => {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) return
    if (!customPaths || Object.keys(customPaths).length === 0) return

    const existing =
      target.customPaths && typeof target.customPaths === 'object' ? target.customPaths : {}

    target.customPaths = { ...existing, ...customPaths }
  }

  const candidates: unknown[] = []
  const seen = new Set<unknown>()
  let current: unknown = AutoSwaggerModule

  while (current && (typeof current === 'object' || typeof current === 'function') && !seen.has(current)) {
    candidates.push(current)
    seen.add(current)

    if ('default' in (current as { default?: unknown })) {
      current = (current as { default?: unknown }).default
    } else {
      break
    }
  }

  const maybeResolveDocs = (target: unknown): unknown | null => {
    if (!target) return null

    // ✅ FIX: inject customPaths for direct generate/docs function on object
    if (typeof (target as { generate?: unknown }).generate === 'function') {
      attachCustomPaths(target)
      return (target as { generate: (routes: unknown, config: typeof swaggerConfig) => unknown }).generate(
        router.toJSON(),
        swaggerConfig
      )
    }

    if (typeof (target as { docs?: unknown }).docs === 'function') {
      attachCustomPaths(target)
      return (target as { docs: (routes: unknown, config: typeof swaggerConfig) => unknown }).docs(
        router.toJSON(),
        swaggerConfig
      )
    }

    // ✅ FIX: inject customPaths for callable function exports
    if (typeof target === 'function') {
      attachCustomPaths(target)
      const autoSwaggerFn = target as (routes: unknown, config: typeof swaggerConfig) => unknown
      return autoSwaggerFn(router.toJSON(), swaggerConfig)
    }

    // class instance generate/docs
    if (typeof (target as { prototype?: { generate?: unknown } }).prototype?.generate === 'function') {
      const instance = new (target as new () => { generate: (routes: unknown, config: typeof swaggerConfig) => unknown })()
      attachCustomPaths(instance)
      return instance.generate(router.toJSON(), swaggerConfig)
    }

    if (typeof (target as { prototype?: { docs?: unknown } }).prototype?.docs === 'function') {
      const instance = new (target as new () => { docs: (routes: unknown, config: typeof swaggerConfig) => unknown })()
      attachCustomPaths(instance)
      return instance.docs(router.toJSON(), swaggerConfig)
    }

    return null
  }

  for (const candidate of candidates) {
    if (!candidate) continue

    const directDocs = maybeResolveDocs(candidate)
    if (directDocs) return directDocs

    if (typeof (candidate as { default?: unknown }).default !== 'undefined') {
      const defaultDocs = maybeResolveDocs((candidate as { default?: unknown }).default)
      if (defaultDocs) return defaultDocs
    }

    if (typeof (candidate as { AutoSwagger?: unknown }).AutoSwagger !== 'undefined') {
      const namedDocs = maybeResolveDocs((candidate as { AutoSwagger?: unknown }).AutoSwagger)
      if (namedDocs) return namedDocs
    }
  }

  throw new Error('AutoSwagger docs generator is unavailable')
}

const swaggerUiDistPath = path.resolve(process.cwd(), 'node_modules', 'swagger-ui-dist')

const assetContentType = (assetName: string) => {
  const ext = path.extname(assetName).toLowerCase()
  switch (ext) {
    case '.css':
      return 'text/css'
    case '.js':
      return 'application/javascript'
    case '.png':
      return 'image/png'
    case '.html':
      return 'text/html'
    case '.map':
      return 'application/json'
    default:
      return 'application/octet-stream'
  }
}

router.get('/swagger.json', async ({ response }) => {
  const swaggerDocs = await resolveSwaggerDocs()
  response.type('application/json')
  response.send(swaggerDocs)
})

router.get('/swagger', async ({ response }) => {
  response.redirect('/docs')
})

router.get('/', async ({ response }) => {
  response.redirect('/docs')
})

router.get('/swagger-ui/:asset', async ({ params, response }) => {
  const assetName = String(params.asset ?? '')
  if (!assetName || assetName !== path.basename(assetName)) {
    response.status(404).send('Not Found')
    return
  }

  try {
    const assetPath = path.join(swaggerUiDistPath, assetName)
    const assetContent = await readFile(assetPath)
    response.type(assetContentType(assetName))
    response.send(assetContent)
  } catch {
    response.status(404).send('Not Found')
  }
})

router.get('/docs', async ({ response }) => {
  const swaggerDocs = await resolveSwaggerDocs()
  const swaggerJson = JSON.stringify(swaggerDocs ?? null).replace(/</g, '\\u003c')
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Swagger UI</title>
    <link rel="stylesheet" type="text/css" href="/swagger-ui/swagger-ui.css" />
    <link rel="icon" type="image/png" href="/swagger-ui/favicon-32x32.png" sizes="32x32" />
    <link rel="icon" type="image/png" href="/swagger-ui/favicon-16x16.png" sizes="16x16" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *:before, *:after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/swagger-ui/swagger-ui-bundle.js"></script>
    <script src="/swagger-ui/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        const swaggerDocs = ${swaggerJson}
        const baseOptions = {
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          plugins: [SwaggerUIBundle.plugins.DownloadUrl],
          layout: 'StandaloneLayout',
        }
        const ui = SwaggerUIBundle(
          swaggerDocs && Object.keys(swaggerDocs).length
            ? { ...baseOptions, spec: swaggerDocs }
            : { ...baseOptions, url: '/swagger.json' }
        )
        window.ui = ui
      }
    </script>
  </body>
</html>`
  response.type('text/html')
  response.send(html)
})