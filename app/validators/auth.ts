import vine from '@vinejs/vine'

//Validator Register
export const register = vine.compile(
  vine.object({
    email: vine.string().email(),
    phone_number: vine.string()
      .regex(/^(?:\+62|62|0)[0-9]{9,14}$/),
    first_name: vine.string().trim(),
    last_name: vine.string().trim(),
    gender: vine.number().in([1, 2]), // 1=Male, 2=Female
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
    phone_number: vine.string()
      .regex(/^(?:\+62|62|0)[0-9]{9,14}$/),
    first_name: vine.string().trim(),
    last_name: vine.string().trim(),
    otp: vine.string(),
    gender: vine.number().in([1, 2]),
    password: vine.string()
      .minLength(8)
      .maxLength(16)
      .regex(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W)/),
  })
)

// Validator requestForgotPassword
export const requestForgotPassword = vine.compile(
  vine.object({
    email: vine.string().email(),
  })
)

// Validator resetPassword
export const resetPassword = vine.compile(
  vine.object({
    email: vine.string().email(),
    otp: vine.string().optional(),
    password: vine.string()
      .minLength(8)
      .maxLength(16)
      .regex(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W)/),
  })
)

// Validator changePassword
export const changePassword = vine.compile(
  vine.object({
    password: vine.string()
      .minLength(8)
      .maxLength(16)
      .regex(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W)/),
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

// Validator update password
export const updatePasswordValidator = vine.compile(
  vine.object({
    old_password: vine.string().minLength(8),
    new_password: vine
      .string()
      .minLength(8)
      .maxLength(16)
      .regex(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W)/), 
    confirm_password: vine.string().sameAs('new_password')
  })
)

export const deactivateAccountValidator = vine.compile(
  vine.object({
    confirm: vine.boolean(),
  })
)
