import type { HttpContext } from '@adonisjs/core/http'

export default class DiscountBulkController {
  public async export({ response, params }: HttpContext) {
    return response.ok({ message: 'TODO export xlsx', discountId: params.id })
  }

  public async import({ response, params }: HttpContext) {
    return response.ok({ message: 'TODO import xlsx', discountId: params.id })
  }
}
