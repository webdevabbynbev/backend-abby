import type { HttpContext } from '@adonisjs/core/http'
import Transaction from '#models/transaction'
import TransactionShipment from '#models/transaction_shipment'
import db from '@adonisjs/lucid/services/db'

export default class TransactionsController {
  public async get({ response, request }: HttpContext) {
    try {
      const queryString = request.qs()
      const transactionNumber = queryString.transaction_number ?? ''
      const status = queryString.status ?? ''
      const user = queryString.user ?? ''
      const startDate = queryString.start_date ?? ''
      const endDate = queryString.end_date ?? ''
      const page = isNaN(parseInt(queryString.page)) ? 1 : parseInt(queryString.page)
      const per_page = isNaN(parseInt(queryString.per_page)) ? 10 : parseInt(queryString.per_page)

      const dataTransaction = await Transaction.query()
        .if(transactionNumber, (query) => {
          query.where('transactions.transaction_number', transactionNumber)
        })
        .if(status, (query) => {
          query.where('transactions.status', status)
        })
        .if(user, (query) => {
          query.where('transactions.user_id', user)
        })
        .if(startDate, (query) => {
          query.where('transactions.created_at', '>=', startDate)
        })
        .if(endDate, (query) => {
          query.where('transactions.created_at', '<=', endDate)
        })
        .preload('detail', (query) => {
          return query.preload('product', (productLoader) => {
            return productLoader.preload('medias')
          })
        })
        .preload('user')
        .preload('shipment')
        .orderBy('transactions.created_at', 'desc')
        .paginate(page, per_page)

      const meta = dataTransaction.toJSON().meta

      return response.status(200).send({
        message: 'success',
        serve: {
          data: dataTransaction?.toJSON().data,
          ...meta,
        },
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async updateReceipt({ response, request }: HttpContext) {
    const trx = await db.transaction()
    try {
      const id = request.input('id')
      const receipt = request.input('receipt')

      const shipment = await TransactionShipment.query().where('id', id).first()
      if (!shipment) {
        await trx.commit()
        return response.status(404).send({
          message: 'Transaction not found.',
          serve: [],
        })
      }
      shipment.recipe = receipt
      await shipment.save()

      const transaction = await Transaction.query().where('id', shipment.transactionId).first()
      if (!transaction) {
        await trx.commit()
        return response.status(404).send({
          message: 'Transaction not found.',
          serve: [],
        })
      }
      transaction.status = 3
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

  public async cancelTransactions({ request, response }: HttpContext) {
    const transactionIds = request.input('transactionIds')
    const trx = await db.transaction()
    try {
      // Validasi input
      if (transactionIds.length === 0) {
        await trx.commit()
        return response.status(400).json({
          message: 'Invalid transaction IDs',
        })
      }

      // Update status transaksi menjadi "canceled"
      await Transaction.query().whereIn('id', transactionIds).update({ status: 4 })

      await trx.commit()
      return response.status(200).json({
        message: 'Transactions successfully updated.',
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).json({
        message: 'An error occurred while update transactions',
        error: error.message,
      })
    }
  }
}
