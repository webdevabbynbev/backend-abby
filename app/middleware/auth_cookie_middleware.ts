import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

const AUTH_COOKIE_NAME = 'auth_token'

export default class AuthCookieMiddleware {
  async handle({ request }: HttpContext, next: NextFn) {
    const existingAuth =
      request.header('authorization') || request.header('Authorization')

    if (!existingAuth) {
      const token = request.cookie(AUTH_COOKIE_NAME)

      if (token) {
        // ✅ set header pada raw node request
        request.request.headers['authorization'] = `Bearer ${token}`
      }
    }

    await next()
  }
}
