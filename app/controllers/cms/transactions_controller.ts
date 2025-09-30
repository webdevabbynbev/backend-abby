import type { HttpContext } from '@adonisjs/core/http'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import { TransactionStatus } from '../../enums/transaction_status.js'
import axios from 'axios'
import env from '#start/env'

export default class TransactionsController {
  public async get({ response, request }: HttpContext) {
    try {
      const {
        transaction_number,
        transaction_status,
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
        .if(transaction_status, (query) => {
          query.where('transaction_status', transaction_status)
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

  public async updateReceipt({ response, request }: HttpContext) {
    const trx = await db.transaction()
    try {
      const transactionId = request.input('transaction_id')

      const transaction = await Transaction.query({ client: trx })
        .where('id', transactionId)
        .preload('details', (detail) => {
          detail.preload('product')
          detail.preload('variant')
        })
        .preload('shipments')
        .preload('ecommerce', (ec) => {
          ec.preload('userAddress', (addr) => {
            addr.preload('provinceData')
            addr.preload('cityData')
            addr.preload('districtData')
            addr.preload('subDistrictData')
          })
          ec.preload('user')
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

      const user = transaction.ecommerce?.user
      const userAddress = transaction.ecommerce?.userAddress
      if (!user || !userAddress) {
        await trx.rollback()
        return response.status(400).send({ message: 'User address not found.', serve: [] })
      }

      //  Hitung total berat
      const totalWeight = transaction.details.reduce((acc, d) => {
        const productWeight = d.product?.weight || 0
        return acc + productWeight * d.qty
      }, 0)

      //  Bangun order details dengan dimensi dari variant
      const orderDetails = transaction.details.map((d) => {
        const variantPrice = Number(d.variant?.price ?? d.price)

        return {
          product_name: d.product?.name || 'Unknown',
          product_variant_name: d.variant?.sku || '-',
          product_price: variantPrice,
          product_weight: Number(d.product?.weight) || 0,
          product_width: Number(d.variant?.width) || 0,
          product_height: Number(d.variant?.height) || 0,
          product_length: Number(d.variant?.length) || 0,
          qty: Number(d.qty),
          subtotal: variantPrice * Number(d.qty),
        }
      })

      const komercePayload = {
        order_date: new Date().toISOString().slice(0, 10),
        brand_name: 'Abby n Bev',
        shipper_name: 'Abby n Bev Store',
        shipper_phone: '628123456789',
        shipper_destination_id: env.get('KOMERCE_ORIGIN_ID') || 423,
        shipper_address: env.get('COMPANY_ADDRESS') || 'Jl. Dummy Bandung',
        shipper_email: 'support@abbynbev.com',
        origin_pin_point: env.get('COMPANY_PINPOINT') || '-6.914744, 107.609810',

        receiver_name: shipment.pic,
        receiver_phone: shipment.pic_phone,
        receiver_destination_id: userAddress.subDistrict,
        receiver_address: userAddress.address,
        receiver_email: user.email,
        destination_pin_point: '',

        shipping: shipment.service?.toUpperCase() || 'JNE',
        shipping_type: shipment.serviceType?.toUpperCase() || 'REG',
        shipping_cost: Number(shipment.price),
        shipping_cashback: 0,
        payment_method:
          env.get('NODE_ENV') === 'development'
            ? 'COD'
            : (transaction.ecommerce?.paymentMethod || 'COD').toUpperCase().replace('_', ' '),

        service_fee: Math.round(transaction.amount * 0.028),
        additional_cost: 0,
        grand_total: Number(transaction.amount),
        cod_value: Number(transaction.amount),
        insurance_value: (() => {
          const hasEligibleProduct = transaction.details.some((d) => {
            const variantPrice = Number(d.variant?.price ?? d.price)
            return variantPrice >= 300000
          })
          return hasEligibleProduct ? Number(shipment.protectionFee ?? 0) : 0
        })(),

        order_details: orderDetails,
      }

      const client = axios.create({
        baseURL: env.get('KOMERCE_DELIVERY_BASE_URL'),
        headers: {
          'x-api-key': env.get('KOMERCE_DELIVERY_API_KEY'),
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      })

      console.log('Payload:', JSON.stringify(komercePayload, null, 2))

      const { data } = await client.post('/order/api/v1/orders/store', komercePayload)

      console.log('Response Komerce:', JSON.stringify(data, null, 2))

      if (data?.meta?.status === 'failed' || !data?.data?.order_no) {
        await trx.rollback()
        return response.status(400).send({
          message: data?.meta?.message || 'Failed to generate resi from Komerce API.',
          serve: data,
        })
      }

      shipment.resiNumber = data.data.order_no
      await shipment.useTransaction(trx).save()

      transaction.transactionStatus = TransactionStatus.ON_DELIVERY.toString()
      await transaction.useTransaction(trx).save()

      await trx.commit()
      return response.status(200).send({
        message: 'Shipment created successfully.',
        serve: {
          transaction_number: transaction.transactionNumber,
          resi_number: shipment.resiNumber,
          courier: shipment.service,
          service_type: shipment.serviceType,
          total_weight: totalWeight,
        },
      })
    } catch (error) {
      await trx.rollback()
      console.error('Error updateReceipt:', error.response?.data || error.message)
      return response.status(500).send({
        message: error.response?.data || error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  // const komercePayload = {
  //   order_date: '2025-09-25',
  //   brand_name: 'Abby n Bev',
  //   shipper_name: 'Abby n Bev Store',
  //   shipper_phone: '628123456789',
  //   shipper_destination_id: 423,
  //   shipper_address: 'Jl. Dummy Bandung',
  //   shipper_email: 'support@abbynbev.com',
  //   origin_pin_point: '-6.914744, 107.609810',

  //   receiver_name: shipment.pic,
  //   receiver_phone: shipment.pic_phone,
  //   receiver_destination_id: 5130,

  //   receiver_address: 'Jl. Dummy Subang',
  //   receiver_email: 'buyer@gmail.com',
  //   destination_pin_point: '-6.905977, 107.613144',

  //   shipping: 'JNE',
  //   shipping_type: 'REG23',
  //   shipping_cost: 16000,
  //   shipping_cashback: 0,
  //   payment_method: 'COD',

  //   //  Sesuai aturan: 2.8% dari produk atau total harga (dummy 14448)
  //   service_fee: Math.round(516000 * 0.028),
  //   additional_cost: 0,
  //   grand_total: 516000,
  //   cod_value: 516000,
  //   insurance_value: 0,

  //   order_details: [
  //     {
  //       product_name: 'Produk Dummy A',
  //       product_variant_name: 'Merah 250ml',
  //       product_price: 250000,
  //       product_weight: 500,
  //       product_width: 10,
  //       product_height: 10,
  //       product_length: 10,
  //       qty: 2,
  //       subtotal: 500000,
  //     },
  //   ],
  // }

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

      //  Ambil transaksi + details
      const transactions = await Transaction.query({ client: trx })
        .whereIn('id', transactionIds)
        .preload('details', (d) => d.preload('product'))

      //  Update status transaksi jadi FAILED
      await Transaction.query({ client: trx })
        .whereIn('id', transactionIds)
        .update({ transaction_status: TransactionStatus.FAILED })

      // Kurangi popularity produk
      for (const t of transactions) {
        for (const detail of t.details) {
          if (detail.product) {
            detail.product.popularity = Math.max(
              0, // jangan sampai minus
              (detail.product.popularity || 0) - detail.qty
            )
            await detail.product.useTransaction(trx).save()
          }
        }
      }

      await trx.commit()
      return response.status(200).json({
        message: 'Transactions successfully canceled & popularity updated.',
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
