import vine from '@vinejs/vine'

/**
 * Validator for creating a new report
 */
export const createReportValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(3).maxLength(255),
    description: vine.string().trim().optional(),
    report_type: vine.enum(['sales', 'sales_product', 'transaction', 'revenue', 'customer', 'inventory']),
    report_period: vine.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom']),
    report_format: vine.enum(['pdf', 'excel', 'csv', 'json']),
    start_date: vine.date(),
    end_date: vine.date(),
    channel: vine.enum(['all', 'ecommerce', 'pos']).optional(),
    filters: vine.object({
      productIds: vine.array(vine.number()).optional(),
      variantIds: vine.array(vine.number()).optional(),
      categoryIds: vine.array(vine.number()).optional(),
      brandIds: vine.array(vine.number()).optional(),
      userIds: vine.array(vine.number()).optional(),
      minAmount: vine.number().optional(),
      maxAmount: vine.number().optional(),
      status: vine.number().optional(),
    }).optional(),
  })
)

/**
 * Validator for updating report filters
 */
export const updateReportFiltersValidator = vine.compile(
  vine.object({
    filters: vine.object({
      productIds: vine.array(vine.number()).optional(),
      variantIds: vine.array(vine.number()).optional(),
      categoryIds: vine.array(vine.number()).optional(),
      brandIds: vine.array(vine.number()).optional(),
      userIds: vine.array(vine.number()).optional(),
      minAmount: vine.number().optional(),
      maxAmount: vine.number().optional(),
      status: vine.number().optional(),
    }),
  })
)

/**
 * Validator for report list query parameters
 */
export const listReportsValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    limit: vine.number().min(1).max(100).optional(),
    report_type: vine.enum(['sales', 'sales_product', 'transaction', 'revenue', 'customer', 'inventory']).optional(),
    status: vine.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  })
)
