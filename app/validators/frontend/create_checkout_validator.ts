import vine from '@vinejs/vine'

export const createCheckoutValidator = vine.compile(
  vine.object({
    cart_ids: vine.array(vine.number()).minLength(1),

    voucher_id: vine.number().optional(),
    referral_code: vine.string().trim().optional(),

    user_address_id: vine.number(),

    shipping_service_type: vine.string(),
    shipping_service: vine.string(),
    shipping_price: vine.number(),

    is_protected: vine.boolean().optional(),
    protection_fee: vine.number().optional(),
    weight: vine.number().optional(),
    shipping_etd: vine.string().optional(),
    etd: vine.string().optional(),
  })
)
