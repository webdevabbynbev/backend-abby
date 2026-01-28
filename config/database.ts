import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const poolMin = Number(env.get('DB_POOL_MIN', 0))
const poolMax = Number(env.get('DB_POOL_MAX', 4))

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
        ssl: env.get('NODE_ENV') === 'production' ? {
          rejectUnauthorized: true,
          ca: env.get('DB_SSL_CA', ''),
        } : {
          rejectUnauthorized: false, // Only for development
        },
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
