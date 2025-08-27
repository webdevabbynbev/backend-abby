import vine from '@vinejs/vine'

/**
 * Validator untuk CREATE (store) tag
 */
export const storeTagValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(100),
    slug: vine.string().trim().maxLength(120),
    description: vine.string().optional(),
  })
)

/**
 * Validator untuk UPDATE tag
 * Semua field optional biar bisa partial update
 */
export const updateTagValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(100).optional(),
    slug: vine.string().trim().maxLength(120).optional(),
    description: vine.string().optional(),
  })
)
