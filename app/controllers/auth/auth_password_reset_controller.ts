import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import PasswordReset from '#models/password_resets'
import User from '#models/user'

import { requestForgotPassword, resetPassword } from '#validators/auth'
import AuthPasswordResetService from '#services/auth/auth_password_reset_service'
import { vineMessagesToString } from '../../utils/validation.js'

export default class AuthPasswordResetController {
  public async requestForgotPassword({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(requestForgotPassword)
      
      // Rate limiting: Check if user already requested reset in last 5 minutes
      const recentRequest = await PasswordReset.query()
        .where('email', payload.email)
        .where('created_at', '>', new Date(Date.now() - 5 * 60 * 1000))
        .first()
      
      if (recentRequest) {
        return response.status(429).send({
          message: 'Please wait 5 minutes before requesting another password reset.',
          serve: []
        })
      }

      const result = await AuthPasswordResetService.request(payload.email)
      return response.status(result.status).send(result.body)
    } catch (err: any) {
      if (err?.status === 422) {
        return response.status(422).send({
          message: vineMessagesToString(err),
          serve: [],
        })
      }

      return response.status(500).send({
        message: 'Internal server error.',
        serve: [],
      })
    }
  }

  public async verifyForgotPassword({ response, request, params }: HttpContext) {
    try {
      if (request.hasValidSignature()) {
        const user = await User.query().where('email', params.email).first()

        if (user) {
          const queryString = request.qs()
          const passwordReset = await PasswordReset.query()
            .where('email', params.email)
            .where('token', queryString.signature)
            .first()

          if (passwordReset) {
            response.redirect().toPath(`${env.get('APP_CLIENT') as string}/reset/${queryString.signature}`)
          } else {
            response.redirect().toPath(`${env.get('APP_CLIENT') as string}/login`)
          }
        } else {
          return response.status(409).send({ message: 'Invalid credentials.', serve: null })
        }
      } else {
        const queryString = request.qs()
        const passwordReset = await PasswordReset.query().where('token', queryString.signature).first()
        if (passwordReset) {
          await PasswordReset.query().where('token', queryString.signature).delete()
        }
        return response.status(403).send({ error: { message: 'Invalid token' } })
      }
    } catch {
      return response.status(500).send({
        message: 'Internal server error.',
        serve: [],
      })
    }
  }

  public async resetPassword({ response, request }: HttpContext) {
    try {
      const payload: any = await request.validateUsing(resetPassword)

      // legacy compatibility: beberapa client mungkin kirim `otp` lama
      const token = payload.token || request.input('token') || payload.otp

      if (!token) {
        return response.status(422).send({ message: 'Token invalid.', serve: [] })
      }

      const result = await AuthPasswordResetService.reset(payload.email, token, payload.password)
      return response.status(result.status).send(result.body)
    } catch (err: any) {
      if (err?.status === 422) {
        return response.status(422).send({
          message: vineMessagesToString(err),
          serve: [],
        })
      }

      return response.status(500).send({
        message: 'Internal server error.',
        serve: [],
      })
    }
  }
}
