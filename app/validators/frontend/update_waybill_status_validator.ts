import vine from '@vinejs/vine'

export const updateWaybillStatusValidator = vine.compile(
  vine.object({
    transaction_number: vine.string().trim().minLength(1),
    status: vine.string().trim().minLength(1),
  })
)
