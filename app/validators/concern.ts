import vine from '@vinejs/vine'

export const storeConcernValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(150),
    description: vine.string().optional(),
  })
)

export const updateConcernValidator = vine.compile(
  vine.object({
    name: vine.string().trim().maxLength(150).optional(),
    description: vine.string().optional(),
  })
)
