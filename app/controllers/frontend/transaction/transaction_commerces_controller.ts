import type { HttpContext } from '@adonisjs/core/http'

import Transaction from '#models/transaction'

import { EcommerceCheckoutService } from '../../../services/ecommerce/ecommerce_checkout_service.js'
import { EcommerceWebhookService } from '../../../services/ecommerce/ecommerce_webhook_service.js'

import { GetUserOrdersUseCase } from '../../../services/order/use_cases/get_user_orders_use_case.js'
import { GetUserOrderDetailUseCase } from '../../../services/order/use_cases/get_user_order_detail_use_case.js'
import { ConfirmUserOrderCompletedUseCase } from '../../../services/order/use_cases/confirm_user_order_completed_use_case.js'

import { SyncShipmentTrackingUseCase } from '../../../services/shipping/use_cases/sync_shipment_tracking_use_case.js'

import { createCheckoutValidator } from '../../../validators/frontend/create_checkout_validator.js'
import { transactionNumberValidator } from '../../../validators/frontend/transaction_number_validator.js'
import { updateWaybillStatusValidator } from '../../../validators/frontend/update_waybill_status_validator.js'

export default class TransactionEcommerceController {
  constructor(
    private checkout = new EcommerceCheckoutService(),
    private webhook = new EcommerceWebhookService(),
    private getUserOrders = new GetUserOrdersUseCase(),
    private getUserOrderDetail = new GetUserOrderDetailUseCase(),
    private confirmCompleted = new ConfirmUserOrderCompletedUseCase(),
    private syncTracking = new SyncShipmentTrackingUseCase()
  ) {}

  public async get({ response, request, auth }: HttpContext) {
    if (!auth.user) {
      return response.status(401).send({ message: 'Unauthorized', serve: null })
    }

    const paginator = await this.getUserOrders.execute({
      userId: auth.user.id,
      qs: request.qs(),
    })

    return response.status(200).send({
      message: 'success',
      serve: {
        data: paginator.toJSON().data,
        ...paginator.toJSON().meta,
      },
    })
  }

  public async create({ response, request, auth }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.status(401).send({ message: 'Unauthorized', serve: null })
    }

    const payload = await request.validateUsing(createCheckoutValidator)
    const result = await this.checkout.createCheckout(user, payload)

    return response.status(200).send({
      message: 'Transaction created successfully.',
      serve: {
        ...result.transaction.toJSON(),
        ecommerce: result.ecommerce.toJSON(),
        shipment: result.shipment.toJSON(),
        meta: result.meta,
      },
    })
  }

  public async webhookMidtrans({ request, response }: HttpContext) {
    await this.webhook.handleMidtransWebhook(request.all())

    return response.status(200).send({
      message: 'ok',
      serve: [],
    })
  }

  public async getByTransactionNumber({ response, request, auth }: HttpContext) {
    if (!auth.user) {
      return response.status(401).send({ message: 'Unauthorized', serve: null })
    }

    const { transaction_number } = await request.validateUsing(transactionNumberValidator)

    const result = await this.getUserOrderDetail.execute({
      userId: auth.user.id,
      transactionNumber: transaction_number,
      syncTracking: true,
    })

    return response.status(200).send({
      message: 'success',
      serve: {
        data: result.dataTransaction,
        waybill: result.waybill,
      },
    })
  }

  public async confirmOrder({ request, response, auth }: HttpContext) {
    if (!auth.user) {
      return response.status(401).send({ message: 'Unauthorized', serve: null })
    }

    const { transaction_number } = await request.validateUsing(transactionNumberValidator)

    const updated = await this.confirmCompleted.execute({
      userId: auth.user.id,
      transactionNumber: transaction_number,
    })

    return response.status(200).send({
      message: 'Transaction marked as completed.',
      serve: updated,
    })
  }

  public async requestPickup({ response }: HttpContext) {
    return response.status(501).send({
      message: 'Pickup request is not implemented (RajaOngkir/Komerce removed).',
      serve: null,
    })
  }

  /**
   * NOTE:
   * Dulu endpoint ini menerima `status` dari client (rawan dimanipulasi).
   * Sekarang diubah jadi "sync tracking" dari Biteship (server fetch).
   */
  public async updateWaybillStatus({ request, response }: HttpContext) {
    const { transaction_number } = await request.validateUsing(updateWaybillStatusValidator)

    const transaction = await Transaction.query()
      .where('transaction_number', transaction_number)
      .preload('shipments')
      .first()

    if (!transaction || transaction.shipments.length === 0) {
      return response.status(404).send({
        message: 'Transaction or shipment not found',
        serve: null,
      })
    }

    const shipment: any = transaction.shipments[0]
    await this.syncTracking.execute({ transaction, shipment, silent: true })

    await transaction.load('shipments')

    return response.status(200).send({
      message: 'Waybill synced',
      serve: transaction.shipments[0],
    })
  }
}
