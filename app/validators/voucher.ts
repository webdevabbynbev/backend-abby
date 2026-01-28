import vine from '@vinejs/vine'

export const create = vine.compile(
  vine.object({
    // wajib isi, nolak whitespace doang
    name: vine.string().trim().minLength(1),
    code: vine.string().trim().minLength(1).maxLength(30),

    // optional tapi kalau dikirim harus valid
    type: vine.number().in([1, 2]).optional(),
    qty: vine.number().min(0).optional(),

    // CMS: 1 = percentage, 2 = amount
    is_percentage: vine.number().in([1, 2]).optional(),

    // CMS: 1 = active, 2 = inactive (controller kamu normalisasi)
    is_active: vine.number().in([1, 2]).optional(),

    // diskon
    percentage: vine.number().min(0).max(100).optional().nullable(),
    price: vine.string().trim().maxLength(30).optional().nullable(),
    max_disc_price: vine.string().trim().maxLength(30).optional().nullable(),

    // biar fleksibel: terima "YYYY-MM-DD HH:mm:ss" dan "YYYY-MM-DDTHH:mm"
    started_at: vine
      .date({ formats: ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm'] })
      .optional()
      .nullable(),
    expired_at: vine
      .date({ formats: ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm'] })
      .optional()
      .nullable(),

    // buat jaga-jaga kalau request ngirim id tapi ini create
    id: vine.number().optional(),
  })
)

export const update = vine.compile(
  vine.object({
    id: vine.number(),

    name: vine.string().trim().minLength(1),
    code: vine.string().trim().minLength(1).maxLength(30),

    type: vine.number().in([1, 2]).optional(),
    qty: vine.number().min(0).optional(),

    is_percentage: vine.number().in([1, 2]).optional(),
    is_active: vine.number().in([1, 2]).optional(),

    percentage: vine.number().min(0).max(100).optional().nullable(),
    price: vine.string().trim().maxLength(30).optional().nullable(),
    max_disc_price: vine.string().trim().maxLength(30).optional().nullable(),

    started_at: vine
      .date({ formats: ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm'] })
      .optional()
      .nullable(),
    expired_at: vine
      .date({ formats: ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DDTHH:mm'] })
      .optional()
      .nullable(),
  })
)
