import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

const mailConfig = defineConfig({
  default: 'smtp',
  from: {
     address: env.get('DEFAULT_FROM_EMAIL') ?? 'no-reply@example.com',
    name: 'Abby n Bev', 
  },
  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST') ?? 'localhost',
      port: Number(env.get('SMTP_PORT') ?? 587),
      secure: false,
      auth: {
        type: 'login',
        user: env.get('SMTP_USERNAME') ?? '',
        pass: env.get('SMTP_PASSWORD') ?? '',
      },
    }),
  },
})


export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}