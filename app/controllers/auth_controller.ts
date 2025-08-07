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
  updateProfile,
  updateProfilePicture,
} from '#validators/auth'
import { OtpAction } from '../enums/setting_types.js'
import { generateOtp } from '../utils/helpers.js'
import { uploadFile } from '../utils/upload_file_service.js'
import { OAuth2Client } from 'google-auth-library'
import vine from '@vinejs/vine'


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
        .first()

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
      const user = await User.findBy('email', email)

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

    const user = await User.findBy('email', email)

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

  // Cek OTP ada dan belum expired
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

  // Cek OTP valid
  const isValidOtp = await hash.verify(otpExist.code, otp)
  if (!isValidOtp) {
    return response.badRequest({
      message: 'Invalid OTP',
      serve: null,
    })
  }

  // Hapus OTP setelah verifikasi (biar tidak bisa reuse)
  await otpExist.delete()

  // Bikin user baru dengan field Abby n Bev
  const user = await User.create({
    email: email,
    phoneNumber: phone_number,
    firstName: first_name,
    lastName: last_name,
    gender: gender || null,
    password: await hash.make(password),
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

  // Generate token akses setelah register sukses
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
    // Validator input
    const validator = vine.compile(
      vine.object({
        token: vine.string(),
      })
    )
    const googleClient = new OAuth2Client()

    try {
      const { token } = await request.validateUsing(validator)

      // Verifikasi token Google
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

      // Pisah nama jadi firstName & lastName
      let firstName = name.split(' ')[0] || ''
      let lastName = name.split(' ').slice(1).join(' ') || ''

      // Cari user by email (soft delete aware)
      // @ts-ignore
      let user = await User.findColumnWithSoftDelete('email', email)

      // Kalau user belum ada, create user baru
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

      // Kalau user ada tapi bukan user Google (googleId null)
      if (user && user.googleId === null) {
        return response.notFound({
          message: 'User not found',
          serve: null,
        })
      } else {
        // Update googleId biar selalu sync (misal user sempat login manual, lalu login google)
        user.googleId = googleId
        await user.save()
      }

      // Check status aktif
      if (user.isActive !== 1) {
        return response.badRequest({
          message: 'Account suspended',
          serve: null,
        })
      }

      // Generate token akses
      const tokenLogin = await this.generateToken(user)

      // Response sukses
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
