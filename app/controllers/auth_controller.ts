import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'

export default class AuthController {
  // REGISTER
  public async register({ request, response }: HttpContext) {
    const { firstName, lastName, email, phoneNumber, password } = request.only([
      'firstName', 'lastName', 'email', 'phoneNumber', 'password'
    ])

    // Cek email unik
    const exists = await User.findBy('email', email)
    if (exists) {
      return response.conflict({ message: 'Email already registered' })
    }

    // Simpan user baru
    const user = await User.create({
      firstName,
      lastName,
      email,
      phoneNumber,
      password: await hash.make(password), // hash password!
      role: 2,        // 1 = admin, 2 = user
      isActive: 1,
    })

    // Generate token
    const token = await User.accessTokens.create(user)

    return response.ok({
      message: 'Register success!',
      user,
      token: token.value!.release(),
    })
  }

  public async login({ request, response }: HttpContext) {
  const { email, password } = request.only(['email', 'password'])
  const user = await User.findBy('email', email)

  if (!user) {
    return response.unauthorized({ message: 'Email not found' })
  }

  if (user.isActive !== 1) {
    return response.unauthorized({ message: 'Account inactive' })
  }

  // PASANG LOG DEBUG DI SINI:
  console.log('DB password:', user.password)
  console.log('Input password:', password)
  const isValid = await hash.verify(user.password, password)
  console.log('isValid?', isValid)

  if (!isValid) {
    return response.unauthorized({ message: 'Wrong password' })
  }

  const token = await User.accessTokens.create(user)

  return response.ok({
    message: 'Login success!',
    user,
    token: token.value!.release(),
  })
}

  // LOGOUT
  public async logout({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Unauthorized' })
    }
    const token = await auth.user!.currentAccessToken
    if (token) {
      await User.accessTokens.delete(user, token.identifier)
    }
    return response.ok({ message: 'Logout success!' })
  }
}
