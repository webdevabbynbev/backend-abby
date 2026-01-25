import type { HttpContext } from '@adonisjs/core/http'
import { randomBytes } from 'node:crypto'
import env from '#start/env'
import User from '#models/user'
import { Role } from '#enums/role'

const GUEST_COOKIE_NAME = 'guest_token'
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

const guestCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.get('NODE_ENV') === 'production',
  path: '/',
  maxAge: GUEST_COOKIE_MAX_AGE,
}

export class GuestUserService {
  private buildEmail(token: string) {
    return `guest+${token}@guest.local`
  }

  private ensureToken({ request, response }: Pick<HttpContext, 'request' | 'response'>) {
    let token = request.cookie(GUEST_COOKIE_NAME) as string | undefined
    if (!token) {
      token = randomBytes(16).toString('hex')
      response.cookie(GUEST_COOKIE_NAME, token, guestCookieOptions)
    }
    return token
  }

  async resolve({ request, response }: Pick<HttpContext, 'request' | 'response'>) {
    const token = this.ensureToken({ request, response })
    const email = this.buildEmail(token)

    const existing = await User.query().where('email', email).first()
    if (existing) return existing

    const user = new User()
    user.firstName = 'Guest'
    user.lastName = null
    user.email = email
    user.password = randomBytes(32).toString('hex')
    user.role = Role.GUEST
    await user.save()

    return user
  }
}