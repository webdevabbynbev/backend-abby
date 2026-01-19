import path from 'node:path'

const normalizeRootPath = (value: string) => value.replace(/\\/g, '/')

const ensureTrailingSlash = (value: string) => (value.endsWith('/') ? value : `${value}/`)

const resolvedRootPath = normalizeRootPath(path.resolve(process.cwd()))

const swaggerConfig = {
  path: ensureTrailingSlash(resolvedRootPath),
  title: 'Backend Abby API',
  version: '1.0.0',
  description: 'API documentation for AdonisJS backend',
  basePath: '/',
  tagIndex: 1,
  ignore: ['/swagger', '/docs'],
  preferredPutPatch: 'PUT',
  common: {
    parameters: {},
    headers: {},
  },
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
    },
  },
  persistAuthorization: true,
  showFullPath: true,
}

export default swaggerConfig