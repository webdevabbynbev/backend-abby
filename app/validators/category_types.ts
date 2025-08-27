import vine from '@vinejs/vine'

export const createCategoryType = vine.compile(
  vine.object({
    name: vine.string(),
    parentId: vine.number().optional(), // FK ke parent category
    level: vine.number().optional(),    // level 1=category, 2=sub, 3=detail
  })
)
