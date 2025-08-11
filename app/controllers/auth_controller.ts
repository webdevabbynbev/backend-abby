import type { HttpContext } from '@adonisjs/core/http';
import User from '#models/user'
import Otp from '#models/otp'
import { Role } from '../enums/role.js'
import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import mail from '@adonisjs/mail/services/main'
import env from '#start/env'
import {
  login,
  register,
  verifyLoginOtp,
  verifyRegisterOtp,
  requestForgotPassword,
  resetPassword,
  updateProfile,
  updateProfilePicture,
  updatePasswordValidator,
  deactivateAccountValidator,
} from '#validators/auth'
import { OtpAction } from '../enums/setting_types.js'
import { generateOtp } from '../utils/helpers.js'
import { uploadFile } from '../utils/upload_file_service.js'
import { OAuth2Client } from 'google-auth-library'
import vine from '@vinejs/vine'
//import { Message } from '@adonisjs/mail'
import PasswordReset from '#models/password_resets'
import db from '@adonisjs/lucid/services/db'



export default class AuthController {
  /**
   * Admin Login (email + password)
   */
  public async loginAdmin({ request, response }: HttpContext) {
    try {
      const { email, password } = request.only(['email', 'password'])
      const user = await User.query()
        .where('email', email)
        .where('role', Role.ADMINISTRATOR)
        .whereNull('deleted_at')
        .first()

      if (!user) {
          return response.badRequest({
          message: 'Account not found or has been deactivated.',
          serve: null,
        })
      }

      if (!user) {
        return response.status(400).send({
          message: 'Invalid credentials.',
          serve: null,
        })
      }

      if (user.isActive !== 1) {
        return response.status(400).send({
          message: 'Account suspended.',
          serve: null,
        })
      }

      const isPasswordValid = await hash.verify(user.password, password)
      if (!isPasswordValid) {
        return response.status(400).send({
          message: 'Invalid credentials.',
          serve: null,
        })
      }

      const token = await User.accessTokens.create(user)

      return response.ok({
        message: 'Login successfully.',
        serve: {
          data: user,
          token: token.value!.release(),
        },
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * User Login 
   */
  public async login({ request, response }: HttpContext) {
    try {
      const { email } = await request.validateUsing(login)
      const user = await User.query()
      .where('email', email)
      .whereNull('deleted_at') 
      .first()

      if (!user) {
          return response.badRequest({
          message: 'Account not found or has been deactivated.',
          serve: null,
        })
      }

      if (!user) {
        return response.notFound({
          message: 'User not found.',
          serve: null,
        })
      }

      if (user.googleId) {
        return response.badRequest({
          message: 'Account registered with Google. Please use Google Login.',
          serve: 
          null,
        })
      }

      if (user.isActive !== 1) {
        return response.badRequest({
          message: 'Account suspended.',
          serve: null,
        })
      }

      // Generate & hash OTP
      const otp = await this.generateUniqueOtp(email, OtpAction.LOGIN)
      const hashedOtp = await hash.make(otp)

      // Save or update OTP
      const otpData = await Otp.query()
        .where('email', email)
        .where('action', OtpAction.LOGIN)
        .first()

      if (otpData) {
        otpData.merge({
          code: hashedOtp,
          expiredAt: DateTime.now().plus({ minutes: 2 }),
          action: OtpAction.LOGIN,
        })
        await otpData.save()
      } else {
        await Otp.create({
          email,
          code: hashedOtp,
          expiredAt: DateTime.now().plus({ minutes: 2 }),
          action: OtpAction.LOGIN,
        })
      }

      // Send OTP to user email
      const from = env.get('DEFAULT_FROM_EMAIL')
      if (!from) throw new Error('DEFAULT_FROM_EMAIL is not set in .env')
      await mail.send((message) => {
      message
        .from(from)
        .to(email)
        .subject('OTP Verification')
        .htmlView('emails/otp', {
      otp: otp,
      email: email,
      })
    })
      return response.ok({
        message: 'Otp sent successfully.',
        serve: true,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Verify Logn OTP
   */
  public async verifyLoginOtp({ request, response }: HttpContext) {
    const { email, otp } = await request.validateUsing(verifyLoginOtp)

    const otpExist = await Otp.query()
      .where('email', email)
      .where('action', OtpAction.LOGIN)
      .where('expiredAt', '>', new Date())
      .first()

    if (!otpExist) {
      return response.badRequest({
        message: 'Invalid OTP',
        serve: null,
      })
    }

    const isValidOtp = await hash.verify(otpExist?.code, otp)

    if (!isValidOtp) {
      return response.badRequest({
        message: 'Invalid OTP',
        serve: null,
      })
    }

    await otpExist.delete()

    const user = await User.query()
    .where('email', email)
    .whereNull('deleted_at') 
    .first()

    if (!user) {
    return response.badRequest({
      message: 'Account not found or has been deactivated.',
      serve: null,
    })
    }

    if (!user || user.googleId !== null) {
      return response.notFound({
        message: 'User not found.',
        serve: null,
      })
    }

    if (user.isActive !== 1) {
      return response.badRequest({
        message: 'Account suspended..',
        serve: null,
      })
    }

    const userData = user.serialize({
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
    })

    const token = await User.accessTokens.create(user, ['*'], {
      expiresIn: request.input('remember_me') ? '30 days' : '1 days',
    })

    return response.ok({
      message: 'Success',
      serve: { data: userData, token: token.value!.release() },
    })
  }

  /**
   * Register (Send OTP)
   */
  public async register({ request, response }: HttpContext) {
    try {
      const { email, phone_number, first_name, last_name, gender, password } = await request.validateUsing(register)

      const user = await User.query().where('email', email).whereNull('deleted_at').first()
      if (user) {
        return response.badRequest({
          message: 'User already exists.',
          serve: null,
        })
      }

      // Generate OTP
      const otp = await this.generateUniqueOtp(email, OtpAction.REGISTER)
      const hashedOtp = await hash.make(otp)

      // Save or update OTP
      const otpData = await Otp.query()
        .where('email', email)
        .where('action', OtpAction.REGISTER)
        .first()

      if (otpData) {
        otpData.merge({
          code: hashedOtp,
          expiredAt: DateTime.now().plus({ minutes: 2 }),
          action: OtpAction.REGISTER,
        })
        await otpData.save()
      } else {
        await Otp.create({
          email,
          code: hashedOtp,
          expiredAt: DateTime.now().plus({ minutes: 2 }),
          action: OtpAction.REGISTER,
        })
      }

      // Send OTP
      const from = env.get('DEFAULT_FROM_EMAIL')
      if (!from) throw new Error('DEFAULT_FROM_EMAIL is not set in .env')
      await mail.send((message) => {
      message
        .from(from)
        .to(email)
        .subject('OTP Verification')
        .htmlView('emails/otp', {
      otp: otp,
      email: email,
      })
    })
      return response.status(200).send({
        message: 'Otp Sent Successfully.',
        serve: true,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Verify Register OTP
   */
  public async verifyRegisterOtp({ request, response }: HttpContext) {
  const { email, phone_number, first_name, last_name, otp, gender, password } = await request.validateUsing(verifyRegisterOtp)

  const otpExist = await Otp.query()
    .where('email', email)
    .where('action', OtpAction.REGISTER)
    .where('expiredAt', '>', new Date())
    .first()

  if (!otpExist) {
    return response.badRequest({
      message: 'OTP Not Found or Expired',
      serve: null,
    })
  }

  const isValidOtp = await hash.verify(otpExist.code, otp)
  if (!isValidOtp) {
    return response.badRequest({
      message: 'Invalid OTP',
      serve: null,
    })
  }

  await otpExist.delete()

  const user = await User.create({
    email: email,
    phoneNumber: phone_number,
    firstName: first_name,
    lastName: last_name,
    gender: gender || null,
    password: password,
    isActive: 1,
    role: Role.GUEST,
  })

  const userData = user.serialize({
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
  })

  const token = await User.accessTokens.create(user)

  return response.ok({
    message: 'Register & OTP verified successfully.',
    serve: { data: userData, token: token.value!.release() },
  })
  }

  /**
   * Logout
   */
  public async logout({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.status(401).send('Unauthorized')
    }
    const token = await user.currentAccessToken
    await User.accessTokens.delete(user, token.identifier)
    return response.status(200).send({
      message: 'Logged out successfully.',
      serve: true,
    })
  }

  /**
   * Request Forgot Password (Send OTP)
   */
  public async requestForgotPassword({ request, response }: HttpContext) {
    try {
      const data = request.all()
      try {
        await requestForgotPassword.validate(data)
      } catch (err) {
        return response.status(422).send({
          message:
            err.messages?.length > 0
              ? err.messages?.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: [],
        })
      }

      const dataUser = await User.query().where('email', request.input('email')).first()

      if (dataUser) {
        try {
          await dataUser.sendForgotPasswordEmail()
        } catch {
          return response.status(500).send({
            message: 'Internal server error.',
            serve: [],
          })
        }
        return response.status(200).send({
          message: 'Please check your email to change your password.',
          serve: dataUser,
        })
      } else {
        return response.status(422).send({
          message: 'Invalid credentials.',
          serve: [],
        })
      }
    } catch (error) {
      return response.status(500).send({
        message: 'Internal server error.',
        serve: [],
      })
    }
  }
  
  /**
   * Verify Forgot Password OTP
   */
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
            response
              .redirect()
              .toPath(`${env.get('APP_CLIENT') as string}/reset/${queryString.signature}`)
          } else {
            response.redirect().toPath(`${env.get('APP_CLIENT') as string}/login`)
          }
        } else {
          return response.status(409).send({
            message: 'Invalid credentials.',
            serve: null,
          })
        }
      } else {
        const queryString = request.qs()
        const passwordReset = await PasswordReset.query()
          .where('token', queryString.signature)
          .first()
        if (passwordReset) {
          await PasswordReset.query().where('token', queryString.signature).delete()
        }
        return response.status(403).send({
          error: {
            message: 'Invalid token',
          },
        })
      }
    } catch (error) {
      return response.status(500).send({
        message: 'Internal server error.',
        serve: [],
      })
    }
  }

  /**
   * Reset Password
   */
  public async resetPassword({ response, request }: HttpContext) {
    const trx = await db.transaction()
    try {
      const data = request.all()
      try {
        await resetPassword.validate(data)
      } catch (err) {
        await trx.commit()
        return response.status(422).send({
          message:
            err.messages?.length > 0
              ? err.messages?.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: [],
        })
      }

      const passwordReset = await PasswordReset.query()
        .where('email', request.input('email'))
        .where('token', request.input('token'))
        .first()
      if (passwordReset) {
        await PasswordReset.query()
          .where('email', request.input('email'))
          .where('token', request.input('token'))
          .delete()
      } else {
        await trx.commit()
        return response.status(422).send({
          message: 'Token invalid.',
          serve: [],
        })
      }

      const dataUser = await User.query().where('email', request.input('email')).first()

      if (dataUser) {
        await dataUser.save()

        await trx.commit()
        return response.status(200).send({
          message: 'Sucessfully change password.',
          serve: dataUser,
        })
      } else {
        await trx.commit()
        return response.status(422).send({
          message: 'Invalid credentials.',
          serve: [],
        })
      }
    } catch (error) {
      await trx.commit()
      return response.status(500).send({
        message: 'Internal server error.',
        serve: [],
      })
    }
  }

  /**
   * Profile
   */
  public async profile({ response, auth }: HttpContext) {
    try {
      const user = auth.user

      return response.status(200).send({
        message: 'Account successfully updated.',
        serve: user?.serialize({
          fields: [
            'id', 'firstName', 'lastName', 'email', 'phoneNumber', 'address', 'gender', 'dob', 'photoProfile',
          ],
        }),
      })
    } catch (error) {
      if (error.status === 422) {
        return response.status(422).send({
          message:
            error.messages?.length > 0
              ? error.messages?.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: error.messages,
        })
      }

      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: null,
      })
    }
  }

  /**
   * Edit Profile Picture
   */
  public async updateProfilePicture({ request, response, auth }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateProfilePicture)

      const user: User = auth?.user as User

      let image = await uploadFile(payload.image, { folder: 'profile', type: 'image' })

      user.photoProfile = image

      await user.save()

      return response.status(200).send({
        message: 'Profile picture successfully updated.',
        serve: true,
      })
    } catch (error) {
      if (error.status === 422) {
        return response.status(422).send({
          message:
            error.messages?.length > 0
              ? error.messages?.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: error.messages,
        })
      }

      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: null,
      })
    }
  }

  /**
   * Update Profile
   */
  public async updateProfile({ request, response, auth }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateProfile)

      const user: User = auth?.user as User

      if (payload.image) {
        let image = await uploadFile(request.file('image'), { folder: 'profile', type: 'image' })

        Object.assign(payload, {
          photoProfile: image,
        })
      }

      user.merge(payload)

      await user.save()

      return response.status(200).send({
        message: 'Account successfully updated.',
        serve: true,
      })
    } catch (error) {
      if (error.status === 422) {
        return response.status(422).send({
          message:
            error.messages?.length > 0
              ? error.messages?.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: error.messages,
        })
      }

      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: null,
      })
    }
  }

  public async loginGoogle({ response, request }: HttpContext) {
    const validator = vine.compile(
      vine.object({
        token: vine.string(),
      })
    )
    const googleClient = new OAuth2Client()

    try {
      const { token } = await request.validateUsing(validator)
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: env.get('GOOGLE_CLIENT_ID'),
      })
      const googlePayload = ticket.getPayload()

      const email = googlePayload?.email
      const name = googlePayload?.name
      const googleId = googlePayload?.sub

      if (!email || !name || !googleId) {
        return response.badRequest({ message: 'Bad Request', serve: null })
      }

      let firstName = name.split(' ')[0] || ''
      let lastName = name.split(' ').slice(1).join(' ') || ''

      let user = await User.findColumnWithSoftDelete('email', email)

      if (!user) {
        user = await User.create({
          email: email,
          firstName: firstName,
          lastName: lastName,
          googleId: googleId,
          isActive: 1,
          role: Role.GUEST,
        })
      }

      if (user && user.googleId === null) {
        return response.notFound({
          message: 'User not found',
          serve: null,
        })
      } else {
        user.googleId = googleId
        await user.save()
      }

      if (user.isActive !== 1) {
        return response.badRequest({
          message: 'Account suspended',
          serve: null,
        })
      }

      const tokenLogin = await this.generateToken(user)

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
          token: tokenLogin,
        },
      })
    } catch (e) {
      return response.internalServerError({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  public async updatePassword({ auth, request, response }: HttpContext) {
  try {
    const user = auth.user!
    const payload = await request.validateUsing(updatePasswordValidator)

    console.log('Old password input:', payload.old_password)
    console.log('Password in DB:', user.password)

    // Cek password lama pakai driver yang sama dengan waktu hash
    const isOldPasswordValid = await hash.use('scrypt').verify(user.password, payload.old_password)
    if (!isOldPasswordValid) {
      return response.badRequest({ message: 'Old password is incorrect' })
    }

    // Pastikan new dan confirm sama
    if (payload.new_password !== payload.confirm_password) {
      return response.badRequest({ message: 'New password and confirmation do not match' })
    }

    // Update password (akan auto hash lewat @beforeSave)
    user.password = payload.new_password
    await user.save()

    return response.ok({ message: 'Password updated successfully' })
  } catch (error) {
    console.error(error)
    return response.status(500).send({
      message: 'Internal server error',
      serve: null,
    })
  }
  }

  public async deactivateAccount({ auth, request, response }: HttpContext) {
  try {
    const payload = await request.validateUsing(deactivateAccountValidator)

    if (!payload.confirm) {
      return response.badRequest({
        message: 'Account deactivation cancelled by user.',
        serve: null,
      })
    }

    const user = auth.user
    if (!user) {
      return response.unauthorized({
        message: 'Unauthorized',
        serve: null,
      })
    }

    // Soft delete user account
    await user.softDelete()

    // Hapus semua token aktif
    const tokens = await User.accessTokens.all(user)
    for (const token of tokens) {
      await User.accessTokens.delete(user, token.identifier)
    }

    return response.ok({
      message: 'Your account has been deactivated successfully.',
      serve: true,
    })
  } catch (error) {
    console.error(error)
    return response.status(500).send({
      message: 'Failed to deactivate account.',
      serve: null,
    })
  }
  }

  private async generateToken(user: User): Promise<string> {
    const token = await User.accessTokens.create(user)
    return token.value!.release()
  }
  
  /**
   * Helper: Generate Unique OTP
   */
  private async generateUniqueOtp(email: string, action: OtpAction): Promise<string> {
    while (true) {
      const otp = generateOtp()
      const existingOtp = await Otp.query()
        .where('email', email)
        .where('action', action)
        .where('code', otp)
        .where('expired_at', '>=', new Date())
        .first()
      if (!existingOtp) {
        return otp
      }
    }
  }
}
