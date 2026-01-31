import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const poolMin = Number(env.get('DB_POOL_MIN', 0))
const poolMax = Number(env.get('DB_POOL_MAX', 4))

const sslCa = env.get('DB_SSL_CA', '').trim()
const sslEnabled = env.get('DB_SSL', env.get('NODE_ENV') === 'production')

if (sslEnabled && sslCa.length === 0) {
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
