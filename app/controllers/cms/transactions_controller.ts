import type { HttpContext } from '@adonisjs/core/http'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import { TransactionStatus } from '../../enums/transaction_status.js'
import axios from 'axios'
import env from '#start/env'

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
      const transactionId = request.input('transaction_id')

      // ✅ Ambil data transaksi + shipment + detail produk
      const transaction = await Transaction.query({ client: trx })
        .where('id', transactionId)
        .preload('shipments')
        .preload('details', (detail) => {
          detail.preload('product')
        })
        .first()

      if (!transaction) {
        await trx.rollback()
        return response.status(404).send({ message: 'Transaction not found.', serve: [] })
      }

      const shipment = transaction.shipments[0]
      if (!shipment) {
        await trx.rollback()
        return response.status(404).send({ message: 'Shipment not found.', serve: [] })
      }

      // ✅ Hitung total berat (ambil dari product.weight)
      const totalWeight = transaction.details.reduce((acc, d) => {
        const productWeight = d.product?.weight || 0
        return acc + productWeight * d.qty
      }, 0)

      // ✅ Buat payload ke Komerce Delivery
      const komercePayload = {
        origin: env.get('KOMERCE_ORIGIN'),
        origin_type: env.get('KOMERCE_ORIGIN_TYPE'),
        destination: shipment.subdistrictId,
        destination_type: 'subdistrict',
        courier: shipment.service,
        service_type: shipment.serviceType,
        weight: totalWeight > 0 ? totalWeight : 1000, // fallback 1kg
        items: transaction.details.map((d) => ({
          name: d.product?.name || 'Produk',
          quantity: d.qty,
          price: Number(d.price),
        })),
        consignee: {
          name: shipment.pic,
          phone: shipment.pic_phone,
          address: shipment.address,
          postal_code: shipment.postalCode,
        },
      }

      // ✅ Call Komerce Delivery API
      const client = axios.create({
        baseURL: env.get('KOMERCE_DELIVERY_BASE_URL'),
        headers: {
          'Authorization': `Bearer ${env.get('KOMERCE_DELIVERY_API_KEY')}`,
          'Content-Type': 'application/json',
        },
      })

      const { data } = await client.post('/store', komercePayload)

      if (!data?.data?.waybill) {
        await trx.rollback()
        return response
          .status(400)
          .send({ message: 'Failed to generate resi from Komerce API.', serve: [] })
      }

      // ✅ Simpan nomor resi ke DB
      shipment.resiNumber = data.data.waybill
      await shipment.useTransaction(trx).save()

      transaction.paymentStatus = TransactionStatus.ON_DELIVERY.toString()
      await transaction.useTransaction(trx).save()

      await trx.commit()
      return response.status(200).send({
        message: 'Shipment created successfully.',
        serve: {
          transaction_number: transaction.transactionNumber,
          resi_number: shipment.resiNumber,
          courier: shipment.service,
          service_type: shipment.serviceType,
          etd: data.data.etd,
          total_weight: totalWeight,
        },
      })
    } catch (error) {
      await trx.rollback()
      console.log(error)
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
