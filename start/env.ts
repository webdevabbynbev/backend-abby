import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  /*
  |--------------------------------------------------------------------------
  | Core App
  |--------------------------------------------------------------------------
  */
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  APP_KEY: Env.schema.string(),
  LOG_LEVEL: Env.schema.enum([
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ] as const),

  TZ: Env.schema.string.optional(),

  APP_TITLE: Env.schema.string.optional(),
  APP_URL: Env.schema.string.optional(),
  APP_CLIENT: Env.schema.string.optional(),
  APP_LANDING: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Database (WAJIB)
  |--------------------------------------------------------------------------
  */
  DB_CONNECTION: Env.schema.enum(['mysql', 'pg'] as const),
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),
  DB_SSL: Env.schema.boolean.optional(),
  DB_POOL_MIN: Env.schema.number.optional(),
  DB_POOL_MAX: Env.schema.number.optional(),

  /*
  |--------------------------------------------------------------------------
  | Rate Limiter / Redis
  |--------------------------------------------------------------------------
  */
  LIMITER_STORE: Env.schema.enum(['memory', 'database'] as const),
  REDIS_HOST: Env.schema.string.optional(),
  REDIS_PORT: Env.schema.number.optional(),
  REDIS_PASSWORD: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Storage
  |--------------------------------------------------------------------------
  */
  DRIVE_DISK: Env.schema.enum(['fs', 'local'] as const),

  /*
  |--------------------------------------------------------------------------
  | AWS S3 (optional)
  |--------------------------------------------------------------------------
  */
  AWS_ACCESS_KEY_ID: Env.schema.string.optional(),
  AWS_SECRET_ACCESS_KEY: Env.schema.string.optional(),
  AWS_REGION: Env.schema.string.optional(),
  AWS_S3_BUCKET: Env.schema.string.optional(),
  AWS_S3_PUBLIC_URL: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Mail / SMTP (optional – divalidasi di service)
  |--------------------------------------------------------------------------
  */
  SMTP_HOST: Env.schema.string.optional(),
  SMTP_PORT: Env.schema.number.optional(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.string.optional(),
  SMTP_SECURE: Env.schema.boolean.optional(),
  DEFAULT_FROM_EMAIL: Env.schema.string.optional(),
  DEFAULT_FROM_NAME: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Supabase (optional)
  |--------------------------------------------------------------------------
  */
  SUPABASE_URL: Env.schema.string.optional(),
  SUPABASE_SERVICE_ROLE_KEY: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Google OAuth (optional)
  |--------------------------------------------------------------------------
  */
  GOOGLE_CLIENT_ID: Env.schema.string.optional(),
  GOOGLE_CLIENT_SECRET: Env.schema.string.optional(),
  GOOGLE_REDIRECT_URI: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Cloudinary (optional)
  |--------------------------------------------------------------------------
  */
  CLOUDINARY_CLOUD_NAME: Env.schema.string.optional(),
  CLOUDINARY_API_KEY: Env.schema.string.optional(),
  CLOUDINARY_API_SECRET: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Midtrans (optional)
  |--------------------------------------------------------------------------
  */
  MIDTRANS_SERVER_KEY: Env.schema.string.optional(),
  MIDTRANS_CLIENT_KEY: Env.schema.string.optional(),
  MIDTRANS_ENV: Env.schema.string.optional(),


  /*
  |--------------------------------------------------------------------------
  | WhatsApp API (optional)
  |--------------------------------------------------------------------------
  */
  WHATSAPP_PHONE_NUMBER_ID: Env.schema.string.optional(),
  WHATSAPP_ACCESS_TOKEN: Env.schema.string.optional(),
  WHATSAPP_API_URL: Env.schema.string.optional(),
  WHATSAPP_TEMPLATE_NAME: Env.schema.string.optional(),
  WHATSAPP_TEMPLATE_LANG: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Biteship (optional)
  |--------------------------------------------------------------------------
  */
  BITESHIP_BASE_URL: Env.schema.string.optional(),
  BITESHIP_API_KEY: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Company Profile (optional)
  |--------------------------------------------------------------------------
  */
  COMPANY_NAME: Env.schema.string.optional(),
  COMPANY_CONTACT_NAME: Env.schema.string.optional(),
  COMPANY_PHONE: Env.schema.string.optional(),
  COMPANY_EMAIL: Env.schema.string.optional(),
  COMPANY_ADDRESS: Env.schema.string.optional(),
  COMPANY_POSTAL_CODE: Env.schema.string.optional(),
  COMPANY_PINPOINT: Env.schema.string.optional(),
})
