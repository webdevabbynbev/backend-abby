
import vine from '@vinejs/vine'

/**
 * Helpers
 */
const digitsOnly = vine.string().trim().regex(/^\d+$/)

const dateFlexible = vine.date({
  formats: ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm'],
})

export const create = vine.compile(
  vine.object({
    // wajib isi, nolak whitespace doang
    name: vine.string().trim().minLength(1),
    code: vine.string().trim().minLength(1).maxLength(30),

    // wajib (biar nggak ada record voucher "kosong" lagi)
    // type: 1 = AMOUNT, 2 = SHIPPING
    type: vine.number().min(1).max(2),
    qty: vine.number().min(0),

    // CMS: 1 = percentage, 2 = amount
    is_percentage: vine.number().min(1).max(2),

    // CMS: 1 = active, 2 = inactive
    is_active: vine.number().min(1).max(2),

    // diskon
    // NOTE:
    // - kalau is_percentage=1 => percentage + max_disc_price dipakai
    // - kalau is_percentage=2 => price dipakai
    // Conditional enforcement paling aman kamu tetep handle di controller (lihat catatan bawah)
    percentage: vine.number().min(0).max(100).optional().nullable(),

    // digits-only supaya backend nolak format "350.000" / "350000.00"
    price: digitsOnly.optional().nullable(),
    max_disc_price: digitsOnly.optional().nullable(),

    started_at: dateFlexible,
    expired_at: dateFlexible,

    // create ignore id kalau kepencet kekirim
    id: vine.number().optional(),
  })
)

export const update = vine.compile(
  vine.object({
    id: vine.number(),

    name: vine.string().trim().minLength(1),
    code: vine.string().trim().minLength(1).maxLength(30),

    type: vine.number().min(1).max(2),
    qty: vine.number().min(0),

    is_percentage: vine.number().min(1).max(2),
    is_active: vine.number().min(1).max(2),

    percentage: vine.number().min(0).max(100).optional().nullable(),
    price: digitsOnly.optional().nullable(),
    max_disc_price: digitsOnly.optional().nullable(),

    started_at: dateFlexible,
    expired_at: dateFlexible,
  })
)
