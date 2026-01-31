import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'
import fs from 'fs'

const poolMin = Number(env.get('DB_POOL_MIN', 0))
const poolMax = Number(env.get('DB_POOL_MAX', 4))


const sslEnabled = env.get('DB_SSL', false) // DISABLED FOR STAGING - ENABLE AGAIN AFTER STAGING
let sslCa = env.get('DB_SSL_CA', '').trim()
const sslCaPath = env.get('DB_SSL_CA_PATH', '').trim()
if (sslEnabled && !sslCa && sslCaPath) {
  if (fs.existsSync(sslCaPath)) {
    sslCa = fs.readFileSync(sslCaPath, 'utf8')
  } else {
    throw new Error(`DB_SSL_CA_PATH file not found: ${sslCaPath}`)
  }
}
if (sslEnabled && !sslCa) {
  throw new Error('DB_SSL_CA is required when DB_SSL is enabled. Provide a CA bundle to verify certificates.')
}
const sslConfig = sslEnabled
  ? {
      rejectUnauthorized: true,
      ...(sslCa.length > 0 ? { ca: sslCa } : {}),
    }
  : false


const dbConfig = defineConfig({
  /**
   * Pastikan di .env:
   * DB_CONNECTION=pg
   */
  connection: env.get('DB_CONNECTION', 'pg'),

  connections: {
    pg: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST'),
        port: Number(env.get('DB_PORT', 5432)),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),

        /**
         * Supabase WAJIB SSL - Secure configuration
         */
        ssl: sslConfig,
      },

      pool: {
        min: poolMin,
        max: poolMax,
      },

      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig