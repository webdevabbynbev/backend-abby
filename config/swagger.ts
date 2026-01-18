import app from '@adonisjs/core/services/app'

const swaggerConfig = {
  path: app.appRoot,
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