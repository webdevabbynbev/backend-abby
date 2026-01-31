import vine from '@vinejs/vine'

const bundleItemSchema = vine.object({
  component_variant_id: vine.number(),
  qty: vine.number().min(1),
})

const variantSchema = vine.object({
  id: vine.number().optional(),
  barcode: vine.string().trim().minLength(1),
  price: vine.any(), // karena di payload kadang string/number, backend normalize
  stock: vine.number(),

  combination: vine.array(vine.number()).optional(),

  // bundling
  bundle_stock_mode: vine.enum(['KIT', 'VIRTUAL']).optional(),
  bundle_items: vine.array(bundleItemSchema).optional(),

  // ✅ one-step KIT assemble
  bundle_kit_qty: vine.number().min(0).optional(),
  bundle_kit_note: vine.string().trim().maxLength(255).optional(),
})

export const createProduct = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(150),
    description: vine.string().optional(),
    weight: vine.number().optional(),
    base_price: vine.number(),

    // optional fields yang memang dipakai oleh CMS
    status: vine.enum(['normal', 'war', 'draft']).optional(),
    is_flashsale: vine.boolean().optional(),

    category_type_id: vine.number().optional(),
    brand_id: vine.number().optional(),
    persona_id: vine.number().optional(),
    master_sku: vine.string().optional(),

    meta_ai: vine.number().optional(),
    meta_title: vine.string().optional(),
    meta_description: vine.string().optional(),
    meta_keywords: vine.string().optional(),

    tag_ids: vine.array(vine.number()).optional(),
    concern_option_ids: vine.array(vine.number()).optional(),
    profile_category_option_ids: vine.array(vine.number()).optional(),

    medias: vine
      .array(
        vine.object({
          url: vine.string().trim(),
          type: vine.any(),
        })
      )
      .optional(),

    discounts: vine
      .array(
        vine.object({
          type: vine.any(),
          value: vine.any(),
          max_value: vine.any().optional(),
          start_date: vine.any().optional(),
          end_date: vine.any().optional(),
        })
      )
      .optional(),

    variants: vine.array(variantSchema).optional(),
  })
)

export const updateProduct = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(150),
    description: vine.string().optional(),
    weight: vine.number().optional(),
    base_price: vine.number(),

    status: vine.enum(['normal', 'war', 'draft']).optional(),
    is_flashsale: vine.boolean().optional(),

    category_type_id: vine.number().optional(),
    brand_id: vine.number().optional(),
    persona_id: vine.number().optional(),
    master_sku: vine.string().optional(),

    meta_ai: vine.number().optional(),
    meta_title: vine.string().optional(),
    meta_description: vine.string().optional(),
    meta_keywords: vine.string().optional(),

    tag_ids: vine.array(vine.number()).optional(),
    concern_option_ids: vine.array(vine.number()).optional(),
    profile_category_option_ids: vine.array(vine.number()).optional(),

    medias: vine
      .array(
        vine.object({
          url: vine.string().trim(),
          type: vine.any(),
        })
      )
      .optional(),

    discounts: vine
      .array(
        vine.object({
          type: vine.any(),
          value: vine.any(),
          max_value: vine.any().optional(),
          start_date: vine.any().optional(),
          end_date: vine.any().optional(),
        })
      )
      .optional(),

    variants: vine.array(variantSchema).optional(),
  })
)
