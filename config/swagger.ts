import path from 'node:path'
import url from 'node:url'

export default {
  path: path.dirname(url.fileURLToPath(import.meta.url)) + '/../',
  title: 'Backend Abby API',
  version: '1.0.0',
  description: 'API documentation for AdonisJS backend',

  basePath: '/', // biarin / kalau mau full path tetap tampil
  // Kalau route bentuknya: /api/v1/<module>/...
  // index segment: 0="" 1="api" 2="v1" 3="<module>"
  tagIndex: 3,

  // Tambahin beberapa yang sering kepake biar gak ke-scan balik jadi endpoint "nyampur"
  ignore: ['/swagger', '/docs', '/swagger.json', '/swagger-json'],

  preferredPutPatch: 'PUT',
  common: { parameters: {}, headers: {} },

  securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer' },
  },

  persistAuthorization: true,
  showFullPath: true,

  // Biar gampang cek dia resolve tag apa (kalau udah beres, bisa balikin ke false)
  debug: false,
}
