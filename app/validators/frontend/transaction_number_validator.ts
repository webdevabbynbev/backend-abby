import vine from '@vinejs/vine'

export const transactionNumberValidator = vine.compile(
  vine.object({
    transaction_number: vine.string().trim().minLength(1),
  })
)
