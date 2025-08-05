import vine from '@vinejs/vine'

//Validator Register
export const register = vine.compile(
  vine.object({
    email: vine.string().email(),
    first_name: vine.string().trim(),
    last_name: vine.string().trim().optional().nullable(),
    gender: vine.number().in([1, 2]).optional().nullable(), // 1=Male, 2=Female
    password: vine.string()
      .minLength(8)
      .maxLength(16)
      .regex(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W)/),
  })
)

// Validator Login
export const login = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  })
)

// Validator verifyLoginOtp
export const verifyLoginOtp = vine.compile(
  vine.object({
    email: vine.string().email(),
    otp: vine.string(),
  })
)

// Validator verifyRegisterOtp
export const verifyRegisterOtp = vine.compile(
  vine.object({
    email: vine.string().email(),
    first_name: vine.string().trim(),
    last_name: vine.string().trim().optional().nullable(),
    otp: vine.string(),
    gender: vine.number().in([1, 2]).optional().nullable(),
    password: vine.string()
      .minLength(8)
      .maxLength(16)
      .regex(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W)/)
      .optional()
      .nullable(),
  })
)

// Validator updateProfile
export const updateProfile = vine.compile(
  vine.object({
    image: vine
      .file({
        extnames: ['png', 'jpg', 'jpeg'],
        size: '2mb',
      })
      .optional()
      .nullable(),
    first_name: vine.string().trim().optional().nullable(),
    last_name: vine.string().trim().optional().nullable(),
    dob: vine.date().optional().nullable(),
    phone_number: vine.string().optional().nullable(),
    gender: vine.number().in([1, 2]).optional().nullable(),
    address: vine.string().optional().nullable(),
  })
)

// Validator updateProfilePicture
export const updateProfilePicture = vine.compile(
  vine.object({
    image: vine.file({
      extnames: ['png', 'jpg', 'jpeg'],
      size: '2mb',
    }),
  })
)
