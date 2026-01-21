import path from 'node:path'
import url from 'node:url'

export default {
  path: path.dirname(url.fileURLToPath(import.meta.url)) + '/../',
  title: 'Backend Abby API',
  version: '1.0.0',
  description: 'API documentation for AdonisJS backend',
  basePath: '/',
  tagIndex: 1,
  ignore: ['/swagger', '/docs'],
  preferredPutPatch: 'PUT',
  common: { parameters: {}, headers: {} },
  securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer' },
  },
  persistAuthorization: true,
  showFullPath: true,
  debug: false, // tambahin ini biar kelihatan dia resolve apa
}
