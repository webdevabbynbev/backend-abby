import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import env from '#start/env'
import vine from '@vinejs/vine'
import { randomBytes } from 'node:crypto'

import { Role } from '../../enums/role.js'
import { badRequest, badRequest400, internalError } from '../../utils/response.js'

import AuthLoginService from '#services/auth/auth_login_service'
import { login as loginValidator } from '#validators/auth'
import { UserRepository } from '#services/user/user_repository'
import { vineMessagesToString } from '../../utils/validation.js'
import { isUserActive } from '#utils/user_status'
import { supabaseAdmin } from '#utils/supabaseAdmin'
import { authRateLimiter } from '#services/auth/auth_rate_limiter'

type SupabaseGoogleIdentity = {
  email: string
  firstName: string
  lastName: string
  googleId: string
}

type IdentityResult =
  | { ok: true; data: SupabaseGoogleIdentity }
  | { ok: false; reason: string }

export default class AuthSessionsController {
  private userRepo = new UserRepository()

  private authCookieName = 'auth_token'

  private authCookieOptions = {
    httpOnly: true,
    sameSite: 'strict' as const, // Better CSRF protection
    secure: env.get('NODE_ENV') === 'production',
    path: '/api', // Restrict cookie path
  }

  private setAuthCookie(response: HttpContext['response'], token: string, maxAgeSeconds: number) {
    response.cookie(this.authCookieName, token, {
      ...this.authCookieOptions,
      maxAge: maxAgeSeconds,
    })
  }

  private clearAuthCookie(response: HttpContext['response']) {
    response.clearCookie(this.authCookieName, {
      ...this.authCookieOptions,
    })
  }

  private stripTokenFromPayload(payload: any) {
    const cloned = { ...payload, serve: { ...(payload?.serve ?? {}) } }
    if (cloned?.serve) delete cloned.serve.token
    return cloned
  }

  public async loginCashier({ request, response }: HttpContext) {
    try {
      const { email, password } = request.only(['email', 'password'])
      const clientIp = request.ip()
      
      // Rate limiting check
      const ipLimit = await authRateLimiter.checkLimit(clientIp, 'ip')
      const emailLimit = await authRateLimiter.checkLimit(email, 'email')
      
      if (!ipLimit.allowed) {
        return response.status(429).send({
          message: authRateLimiter.getBlockedMessage(ipLimit.resetTime!),
          serve: []
        })
      }
      
      if (!emailLimit.allowed) {
        return response.status(429).send({
          message: authRateLimiter.getBlockedMessage(emailLimit.resetTime!),
          serve: []
        })
      }
      
      const result = await AuthLoginService.loginCashier(email, password)

      if (!result.ok) {
        // Record failed attempt
        await authRateLimiter.recordFailedAttempt(clientIp, 'ip')
        await authRateLimiter.recordFailedAttempt(email, 'email')
        return badRequest(response, result.message)
      }
      
      // Reset attempts on successful login
      await authRateLimiter.resetAttempts(clientIp, 'ip')
      await authRateLimiter.resetAttempts(email, 'email')

      const token = result.payload?.serve?.token
      if (token) this.setAuthCookie(response, token, 60 * 60 * 24)

      return response.ok(result.payload)
    } catch (error) {
      return internalError(response, error)
    }
  }

  public async loginAdmin({ request, response }: HttpContext) {
    try {
      const { email, password } = request.only(['email', 'password'])
      const clientIp = request.ip()
      
      // Rate limiting check
      const ipLimit = await authRateLimiter.checkLimit(clientIp, 'ip')
      const emailLimit = await authRateLimiter.checkLimit(email, 'email')
      
      if (!ipLimit.allowed) {
        return response.status(429).send({
          message: authRateLimiter.getBlockedMessage(ipLimit.resetTime!),
          serve: []
        })
      }
      
      if (!emailLimit.allowed) {
        return response.status(429).send({
          message: authRateLimiter.getBlockedMessage(emailLimit.resetTime!),
          serve: []
        })
      }
      
      const result = await AuthLoginService.loginAdmin(email, password)

      if (!result.ok) {
        // Record failed attempt
        await authRateLimiter.recordFailedAttempt(clientIp, 'ip')
        await authRateLimiter.recordFailedAttempt(email, 'email')
        const fn = result.errorType === 'badRequest400' ? badRequest400 : badRequest
        return fn(response, result.message)
      }
      
      // Reset attempts on successful login
      await authRateLimiter.resetAttempts(clientIp, 'ip')
      await authRateLimiter.resetAttempts(email, 'email')

      const token = result.payload?.serve?.token
      if (token) this.setAuthCookie(response, token, 60 * 60 * 24)

      return response.ok(result.payload)
    } catch (error) {
      return internalError(response, error)
    }
  }

  public async login({ request, response }: HttpContext) {
    try {
      const { email_or_phone, password } = await request.validateUsing(loginValidator)
      const rememberMe = Boolean(request.input('remember_me'))
      const clientIp = request.ip()
      
      // Rate limiting check
      const ipLimit = await authRateLimiter.checkLimit(clientIp, 'ip')
      const identifierLimit = await authRateLimiter.checkLimit(email_or_phone, 'email')
      
      if (!ipLimit.allowed) {
        return response.status(429).send({
          message: authRateLimiter.getBlockedMessage(ipLimit.resetTime!),
          serve: []
        })
      }
      
      if (!identifierLimit.allowed) {
        return response.status(429).send({
          message: authRateLimiter.getBlockedMessage(identifierLimit.resetTime!),
          serve: []
        })
      }

      const result = await AuthLoginService.loginCustomer(email_or_phone, password, rememberMe)
      if (!result.ok) {
        // Record failed attempt
        await authRateLimiter.recordFailedAttempt(clientIp, 'ip')
        await authRateLimiter.recordFailedAttempt(email_or_phone, 'email')
        return badRequest(response, result.message)
      }
      
      // Reset attempts on successful login
      await authRateLimiter.resetAttempts(clientIp, 'ip')
      await authRateLimiter.resetAttempts(email_or_phone, 'email')

      const token = result.payload?.serve?.token
      if (token) {
        const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24
        this.setAuthCookie(response, token, maxAge)
      }

      return response.ok(this.stripTokenFromPayload(result.payload))
    } catch (e: any) {
      const isValidation =
        e?.status === 422 ||
        e?.code === 'E_VALIDATION_ERROR' ||
        e?.code === 'E_VALIDATION_FAILURE' ||
        e?.name === 'E_VALIDATION_ERROR' ||
        e?.name === 'E_VALIDATION_FAILURE' ||
        Array.isArray(e?.messages)

      if (isValidation) {
        return response.status(422).send({
          message: vineMessagesToString(e),
          errors: e?.messages ?? null,
          serve: null,
        })
      }

      console.error(e)
      return internalError(response, e)
    }
  }

  public async verifyLoginOtp({ response }: HttpContext) {
    return response.badRequest({
      message: 'OTP login is disabled. Please use /auth/login (no OTP).',
      serve: null,
    })
  }

  public async logout({ auth, response }: HttpContext) {
    try {
      const user = auth.user
      if (user) {
        const token = await user.currentAccessToken
        if (token) {
          await User.accessTokens.delete(user, token.identifier)
        }
      }

      this.clearAuthCookie(response)

      return response.status(200).send({
        message: 'Logged out successfully.',
        serve: true,
      })
    } catch (error) {
      this.clearAuthCookie(response)
      return internalError(response, error)
    }
  }

  private needsProfileCompletion(user: User): boolean {
    const firstNameOk = !!user.firstName && String(user.firstName).trim().length > 0
    const lastNameOk = !!user.lastName && String(user.lastName).trim().length > 0
    const phoneOk = !!user.phoneNumber && String(user.phoneNumber).trim().length > 0
    const addressOk = !!(user as any).address
    return !(firstNameOk && lastNameOk && phoneOk && addressOk)
  }

  /**
   * Verifikasi Supabase session access_token (JWT) lalu ambil identitas Google.
   * Return reason jelas supaya gampang debug (env salah, jwt invalid, dll).
   */
  private async getSupabaseGoogleIdentity(accessToken: string): Promise<IdentityResult> {
    try {
      const token = String(accessToken || '').replace(/^Bearer\s+/i, '').trim()
      if (!token) return { ok: false, reason: 'Missing token' }

      const { data, error } = await supabaseAdmin.auth.getUser(token)

      if (error || !data?.user) {
        return {
          ok: false,
          reason: `Supabase getUser failed: ${error?.message || 'unknown error'}`,
        }
      }

      const u: any = data.user
      const email = u?.email?.toLowerCase()

      const identities: any[] = Array.isArray(u?.identities) ? u.identities : []
      const googleIdentity = identities.find((i) => i?.provider === 'google')

      if (!googleIdentity) {
        return { ok: false, reason: 'No google identity in Supabase user' }
      }

      const identityData: any = googleIdentity?.identity_data ?? {}
      const userMeta: any = u?.user_metadata ?? {}

      const googleId: string | undefined =
        googleIdentity?.provider_id || identityData?.sub || identityData?.user_id || u?.id

      let firstName: string = identityData?.given_name || userMeta?.first_name || ''
      let lastName: string = identityData?.family_name || userMeta?.last_name || ''

      if (!firstName && !lastName) {
        const fullName: string =
          identityData?.full_name || identityData?.name || userMeta?.full_name || userMeta?.name || ''
        const parts = String(fullName).trim().split(/\s+/)
        firstName = parts[0] || ''
        lastName = parts.slice(1).join(' ') || ''
      }

      if (!email) return { ok: false, reason: 'Missing email from Supabase user' }
      if (!googleId) return { ok: false, reason: 'Missing googleId from Supabase user' }

      return { ok: true, data: { email, firstName, lastName, googleId } }
    } catch (e: any) {
      return { ok: false, reason: `Supabase getUser threw: ${e?.message || 'unknown error'}` }
    }
  }

  public async loginGoogle({ response, request }: HttpContext) {
    const validator = vine.compile(
      vine.object({
        token: vine.string(),
      })
    )

    try {
      const { token } = await request.validateUsing(validator)

      const identityRes = await this.getSupabaseGoogleIdentity(token)
      if (!identityRes.ok) return badRequest(response, identityRes.reason)

      const { email, googleId } = identityRes.data

      const user = await this.userRepo.findActiveByEmail(email)
      if (!user) {
        return badRequest(response, 'Akun belum terdaftar. Silakan daftar terlebih dahulu.')
      }

      if (user.googleId && user.googleId !== googleId) {
        return badRequest(response, 'Google account mismatch')
      }

      if (!user.googleId) {
        user.googleId = googleId
        await user.save()
      }

      if (!isUserActive(user.isActive)) {
        return badRequest(response, 'Account suspended')
      }

      const tokenLogin = await this.generateToken(user)
      this.setAuthCookie(response, tokenLogin, 60 * 60 * 24 * 30)

      return response.ok({
        message: 'Ok',
        serve: {
          data: user.serialize({
            fields: [
              'id',
              'firstName',
              'lastName',
              'email',
              'gender',
              'address',
              'phoneNumber',
              'dob',
              'photoProfile',
              'role',
              'createdAt',
              'updatedAt',
            ],
          }),
          token: tokenLogin, // ✅ added
          is_new_user: false,
          needs_profile_completion: this.needsProfileCompletion(user),
        },
      })
    } catch (e: any) {
      if (e?.status === 422 || Array.isArray(e?.messages)) {
        return response.status(422).send({
          message: vineMessagesToString(e),
          errors: e?.messages ?? null,
          serve: null,
        })
      }
      return internalError(response, e)
    }
  }

  public async registerGoogle({ response, request }: HttpContext) {
    const validator = vine.compile(
      vine.object({
        token: vine.string(),
        accept_privacy_policy: vine.boolean().optional(),
      })
    )

    try {
      const { token, accept_privacy_policy } = await request.validateUsing(validator)

      const identityRes = await this.getSupabaseGoogleIdentity(token)
      if (!identityRes.ok) return badRequest(response, identityRes.reason)

      const { email, firstName, lastName, googleId } = identityRes.data

      let user = await User.query().where('email', email).first()
      let isNewUser = false

      if (!user) {
        if (!accept_privacy_policy) {
          return response.status(422).send({
            message: 'Anda harus menyetujui Privacy Policy sebelum mendaftar.',
            serve: null,
          })
        }

        isNewUser = true
        const randomPass = randomBytes(24).toString('hex')

        user = await User.create({
          email,
          firstName,
          lastName,
          googleId,
          isActive: 1,
          role: Role.GUEST,
          password: randomPass,
        })
      } else {
        if (!isUserActive(user.isActive)) {
          return badRequest(response, 'Account suspended')
        }

        if (user.googleId && user.googleId !== googleId) {
          return badRequest(response, 'Google account mismatch')
        }

        if (!user.googleId) user.googleId = googleId
        if (!user.firstName) user.firstName = firstName
        if (!user.lastName) user.lastName = lastName
        await user.save()
      }

      const tokenLogin = await this.generateToken(user)
      this.setAuthCookie(response, tokenLogin, 60 * 60 * 24 * 30)

      return response.ok({
        message: 'Ok',
        serve: {
          data: user.serialize({
            fields: [
              'id',
              'firstName',
              'lastName',
              'email',
              'gender',
              'address',
              'phoneNumber',
              'dob',
              'photoProfile',
              'role',
              'createdAt',
              'updatedAt',
            ],
          }),
          token: tokenLogin, // ✅ added
          is_new_user: isNewUser,
          needs_profile_completion: isNewUser ? true : this.needsProfileCompletion(user),
        },
      })
    } catch (e: any) {
      if (e?.status === 422 || Array.isArray(e?.messages)) {
        return response.status(422).send({
          message: vineMessagesToString(e),
          errors: e?.messages ?? null,
          serve: null,
        })
      }
      return internalError(response, e)
    }
  }

  private async generateToken(user: User): Promise<string> {
    const token = await User.accessTokens.create(user)
    return token.value!.release()
  }
}

// Toko Kosmetik Bandung
