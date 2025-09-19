import type { HttpContext } from '@adonisjs/core/http'
import Transaction from '#models/transaction'
import TransactionShipment from '#models/transaction_shipment'
import db from '@adonisjs/lucid/services/db'
import { TransactionStatus } from '../../enums/transaction_status.js'

export default class TransactionsController {
  /**
   * 🔍 Get All Transactions (CMS)
   * - Bisa filter: transactionNumber, paymentStatus, user, date range
   * - Support pagination
   */
  public async get({ response, request }: HttpContext) {
    try {
      const {
        transaction_number,
        payment_status,
        user,
        start_date,
        end_date,
        channel,
        page,
        per_page,
      } = request.qs()

      const pageNumber = isNaN(parseInt(page)) ? 1 : parseInt(page)
      const perPage = isNaN(parseInt(per_page)) ? 10 : parseInt(per_page)

      const dataTransaction = await Transaction.query()
        .if(transaction_number, (query) => {
          query.where('transaction_number', transaction_number)
        })
        .if(payment_status, (query) => {
          query.where('payment_status', payment_status)
        })
        .if(user, (query) => {
          query.where('user_id', user)
        })
        .if(start_date, (query) => {
          query.where('created_at', '>=', start_date)
        })
        .if(end_date, (query) => {
          query.where('created_at', '<=', end_date)
        })
        .if(channel, (query) => {
          if (channel === 'ecommerce') {
            query.whereHas('ecommerce', () => {})
          }
          if (channel === 'pos') {
            query.whereHas('pos', () => {})
          }
        })

        .preload('details', (detailsQuery) => {
          detailsQuery.preload('product', (productLoader) => {
            productLoader.preload('medias')
          })
          detailsQuery.preload('variant')
        })
        .preload('user')
        .preload('shipments')
        .preload('ecommerce')
        .preload('pos')
        .orderBy('created_at', 'desc')
        .paginate(pageNumber, perPage)

      return response.status(200).send({
        message: 'success',
        serve: {
          data: dataTransaction.toJSON().data,
          ...dataTransaction.toJSON().meta,
        },
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  /**
   * 🚚 Update Receipt Number (resi) + Update Status jadi ON_DELIVERY
   */
  public async updateReceipt({ response, request }: HttpContext) {
    const trx = await db.transaction()
    try {
      const id = request.input('id')
      const resiNumber = request.input('resi_number')

      const shipment = await TransactionShipment.query({ client: trx }).where('id', id).first()
      if (!shipment) {
        await trx.rollback()
        return response.status(404).send({
          message: 'Shipment not found.',
          serve: [],
        })
      }

      shipment.resiNumber = resiNumber
      await shipment.save()

      const transaction = await Transaction.query({ client: trx })
        .where('id', shipment.transactionId)
        .first()
      if (!transaction) {
        await trx.rollback()
        return response.status(404).send({
          message: 'Transaction not found.',
          serve: [],
        })
      }

      transaction.paymentStatus = TransactionStatus.ON_DELIVERY.toString()
      await transaction.save()

      await trx.commit()
      return response.status(200).send({
        message: 'Receipt updated successfully.',
        serve: [],
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  /**
   * Cancel Transactions
   */
  public async cancelTransactions({ request, response }: HttpContext) {
    const transactionIds = request.input('transactionIds')
    const trx = await db.transaction()
    try {
      if (!transactionIds || transactionIds.length === 0) {
        await trx.rollback()
        return response.status(400).json({
          message: 'Invalid transaction IDs',
        })
      }

      await Transaction.query({ client: trx })
        .whereIn('id', transactionIds)
        .update({ payment_status: TransactionStatus.FAILED })

      await trx.commit()
      return response.status(200).json({
        message: 'Transactions successfully canceled.',
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).json({
        message: 'An error occurred while canceling transactions',
        error: error.message,
      })
    }
  }
}
