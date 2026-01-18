import type { HttpContext } from '@adonisjs/core/http'
import NumberUtils from '#utils/number'
import { fail, ok } from '#utils/response'
import { GetUserOrdersUseCase } from '#services/order/use_cases/get_user_orders_use_case'
import { GetUserOrderDetailUseCase } from '#services/order/use_cases/get_user_order_detail_use_case'
import { ConfirmUserOrderCompletedUseCase } from '#services/order/use_cases/confirm_user_order_completed_use_case'

export default class OrdersController {
  private listOrders = new GetUserOrdersUseCase()
  private getDetail = new GetUserOrderDetailUseCase()
  private confirmCompleted = new ConfirmUserOrderCompletedUseCase()

  private getUserId(auth: any) {
    return NumberUtils.toNumber(auth.user?.id ?? auth.user?.userId, 0)
  }

  /**
   * GET /orders
   */
  public async index({ auth, request, response }: HttpContext) {
    try {
      const userId = this.getUserId(auth)
      if (!userId) return fail(response, 401, 'Unauthorized', [])

      const qs = request.qs()
      const data = await this.listOrders.execute({ userId, qs })

      return ok(response, data, 200, 'success')
    } catch (error: any) {
      const status = error?.httpStatus || 500
      return fail(response, status, error?.message || 'Internal Server Error', [])
    }
  }

  /**
   * GET /orders/:transactionNumber
   * show detail + auto sync tracking
   */
  public async show({ auth, params, response }: HttpContext) {
    try {
      const userId = this.getUserId(auth)
      if (!userId) return fail(response, 401, 'Unauthorized', [])

      const transactionNumber = String(params.transactionNumber || '').trim()
      if (!transactionNumber) return fail(response, 400, 'transactionNumber invalid', [])

      const result = await this.getDetail.execute({
        userId,
        transactionNumber,
        syncTracking: true,
      })

      return ok(response, (result as any).dataTransaction, 200, 'success')
    } catch (error: any) {
      const status = error?.httpStatus || 400
      return fail(response, status, error?.message || 'Internal Server Error', [])
    }
  }

  /**
   * PUT /orders/:transactionNumber/confirm
   */
  public async confirm({ auth, params, response }: HttpContext) {
    try {
      const userId = this.getUserId(auth)
      if (!userId) return fail(response, 401, 'Unauthorized', [])

      const transactionNumber = String(params.transactionNumber || '').trim()
      if (!transactionNumber) return fail(response, 400, 'transactionNumber invalid', [])

      const updated = await this.confirmCompleted.execute({ userId, transactionNumber })

      return ok(response, updated, 200, 'Pesanan berhasil dikonfirmasi selesai.')
    } catch (error: any) {
      const status = error?.httpStatus || 400
      return fail(response, status, error?.message || 'Internal Server Error', [])
    }
  }

  /**
   * PUT /orders/:transactionNumber/refresh-tracking
   */
  public async refreshTracking({ auth, params, response }: HttpContext) {
    try {
      const userId = this.getUserId(auth)
      if (!userId) return fail(response, 401, 'Unauthorized', [])

      const transactionNumber = String(params.transactionNumber || '').trim()
      if (!transactionNumber) return fail(response, 400, 'transactionNumber invalid', [])

      const result = await this.getDetail.execute({
        userId,
        transactionNumber,
        syncTracking: true,
      })

      return ok(response, (result as any).dataTransaction, 200, 'Tracking berhasil diperbarui.')
    } catch (error: any) {
      const status = error?.httpStatus || 400
      return fail(response, status, error?.message || 'Internal Server Error', [])
    }
  }
}
