import vine from '@vinejs/vine'

/**
 * Validator untuk Create Category
 */
export const storeProfileCategoryValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(100),
    type: vine.string().trim().maxLength(50).optional(),
  })
)

/**
 * Validator untuk Update Category
 */
export const updateProfileCategoryValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(100).optional(),
    type: vine.string().trim().maxLength(50).optional(),
  })
)
