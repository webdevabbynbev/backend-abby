import vine from '@vinejs/vine'

/**
 * Validator untuk input Concerns user
 */
export const CreateUserBeautyConcernValidator = vine.compile(
  vine.object({
    concern_option_ids: vine
      .array(vine.number().withoutDecimals().positive())
      .minLength(1)
      .distinct(),
  })
)

/**
 * Validator untuk input Profiles user
 */
export const CreateUserBeautyProfileValidator = vine.compile(
  vine.object({
    profile_option_ids: vine
      .array(vine.number().withoutDecimals().positive())
      .minLength(1)
      .distinct(),
  })
)
