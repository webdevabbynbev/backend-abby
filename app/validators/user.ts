import vine from '@vinejs/vine'
import { Role } from '../enums/role.js'

export const createUser = vine.compile(
  vine.object({
    first_name: vine.string().trim().optional().nullable(),
    last_name: vine.string().trim().optional().nullable(),
    email: vine.string().unique(async (db, value, field) => {
      const user = await db
        .from('users')
        .whereNot('id', field.data.params.id) // exclude diri sendiri
        .whereNot('role', Role.GUEST)
        .where('email', value)
        .first()
      return !user
    }).optional(),
    phone_number: vine.string().optional().nullable(),
    gender: vine.number().in([1, 2]).optional().nullable(),
    password: vine.string()
      .minLength(8)
      .maxLength(16)
      .regex(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W)/)
      .optional()
      .nullable(),
    role: vine.number(),
  })
)

export const updateUser = vine.compile(
  vine.object({
    first_name: vine.string().trim().optional().nullable(),
    last_name: vine.string().trim().optional().nullable(),
    email: vine.string().unique(async (db, value, field) => {
      const user = await db
        .from('users')
        .whereNot('id', field.data.params.id) // exclude diri sendiri
        .whereNot('role', Role.GUEST)
        .where('email', value)
        .first()
      return !user
    }).optional(),
    phone_number: vine.string().optional().nullable(),
    gender: vine.number().in([1, 2]).optional().nullable(),
    password: vine.string()
      .minLength(8)
      .maxLength(16)
      .regex(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*\W)/)
      .optional()
      .nullable(),
    role: vine.number(),
  })
)

