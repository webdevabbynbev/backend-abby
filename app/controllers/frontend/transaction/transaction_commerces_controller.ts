import type { HttpContext } from '@adonisjs/core/http'

import { EcommerceCheckoutService } from '../../../services/ecommerce/ecommerce_checkout_service.js'
import { EcommerceOrderService } from '../../../services/ecommerce/ecommerce_order_service.js'
import { EcommerceWebhookService } from '../../../services/ecommerce/ecommerce_webhook_service.js'

import { createCheckoutValidator } from '../../../validators/frontend/create_checkout_validator.js'
import { transactionNumberValidator } from '../../../validators/frontend/transaction_number_validator.js'
import { updateWaybillStatusValidator } from '../../../validators/frontend/update_waybill_status_validator.js'

export default class TransactionEcommerceController {
  constructor(
    private checkout = new EcommerceCheckoutService(),
    private orders = new EcommerceOrderService(),
    private webhook = new EcommerceWebhookService()
  ) {}

  public async get({ response, request, auth }: HttpContext) {
    const paginator = await this.orders.getList(auth.user?.id ?? 0, request.qs())

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

  public async getByTransactionNumber({ response, request }: HttpContext) {
    const { transaction_number } = await request.validateUsing(transactionNumberValidator)
    const result = await this.orders.getByTransactionNumber(transaction_number)

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
    const tx = await this.orders.confirmOrder(auth.user.id, transaction_number)

    return response.status(200).send({
      message: 'Transaction marked as completed.',
      serve: tx,
    })
  }

  public async requestPickup({ response }: HttpContext) {
    return response.status(501).send({
      message: 'Pickup request is not implemented (RajaOngkir/Komerce removed).',
      serve: null,
    })
  }

  public async updateWaybillStatus({ request, response }: HttpContext) {
    const { transaction_number, status } = await request.validateUsing(updateWaybillStatusValidator)

    const shipment = await this.orders.updateWaybillStatus(transaction_number, status)

    return response.status(200).send({
      message: 'Waybill status updated',
      serve: shipment,
    })
  }
}
