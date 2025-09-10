import vine from '@vinejs/vine'

/**
 * Validator untuk Create Option
 */
export const storeProfileCategoryOptionValidator = vine.compile(
  vine.object({
    profileCategoriesId: vine.number(),
    label: vine.string().trim().maxLength(100),
    value: vine.string().trim().maxLength(100),
    isActive: vine.boolean().optional(),
  })
)

/**
 * Validator untuk Update Option
 */
export const updateProfileCategoryOptionValidator = vine.compile(
  vine.object({
    profileCategoriesId: vine.number().optional(),
    label: vine.string().trim().maxLength(100).optional(),
    value: vine.string().trim().maxLength(100).optional(),
    isActive: vine.boolean().optional(),
  })
)
