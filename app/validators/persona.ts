import vine from '@vinejs/vine'

/**
 * Validator untuk CREATE (store) tag
 */
export const storePersonaValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(100),
    description: vine.string().optional(),
  })
)

/**
 * Validator untuk UPDATE tag
 */
export const updatePersonaValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(100).optional(),
    description: vine.string().optional(),
  })
)
