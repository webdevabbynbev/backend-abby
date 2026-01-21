import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const useSsl = env.get('DB_SSL', false)
const connection = env.get('DB_CONNECTION', 'mysql')
const poolMin = env.get('DB_POOL_MIN', 0)
const poolMax = env.get('DB_POOL_MAX', 3)
const dbConfig = defineConfig({
  connection,
  connections: {
    mysql: {
      client: 'mysql2',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
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
    pg: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
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