import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Transaction from '#models/transaction'
import TransactionEcommerce from '#models/transaction_ecommerce'
import TransactionDetail from '#models/transaction_detail'
import TransactionShipment from '#models/transaction_shipment'
import TransactionCart from '#models/transaction_cart'
import Voucher from '#models/voucher'
import ProductVariant from '#models/product_variant'
import Product from '#models/product'
import UserAddress from '#models/user_address'
import axios from 'axios'
import env from '#start/env'
import { TransactionStatus } from '../../enums/transaction_status.js'
import _ from 'lodash'
import qs from 'qs'

export default class TransactionEcommerceController {
  /**
   * Get list transaction ecommerce user login
   */
  public async get({ response, request, auth }: HttpContext) {
    try {
      const queryString = request.qs()
      const sortBy = queryString.field || 'created_at'
      const sortType = queryString.value || 'DESC'
      const transactionNumber = queryString.transaction_number ?? ''
      const status = queryString.status ?? ''
      const startDate = queryString.start_date ?? ''
      const endDate = queryString.end_date ?? ''
      const page = isNaN(parseInt(queryString.page)) ? 1 : parseInt(queryString.page)
      const per_page = isNaN(parseInt(queryString.per_page)) ? 10 : parseInt(queryString.per_page)

      const dataTransaction = await TransactionEcommerce.query()
        .whereHas('transaction', (trxQuery) => {
          trxQuery.where('user_id', auth.user?.id ?? 0)

          if (transactionNumber) trxQuery.where('transaction_number', transactionNumber)
          if (status) trxQuery.where('status', status)
          if (startDate) trxQuery.where('created_at', '>=', startDate)
          if (endDate) trxQuery.where('created_at', '<=', endDate)
        })
        .preload('transaction', (trxLoader) => {
          trxLoader.preload('details', (detailLoader) => {
            detailLoader.preload('product', (productLoader) => {
              productLoader.preload('medias')
            })
          })
        })
        .preload('shipment')
        .orderBy(sortBy, sortType)
        .paginate(page, per_page)

      return response.status(200).send({
        message: 'success',
        serve: {
          data: dataTransaction?.toJSON().data,
          ...dataTransaction.toJSON().meta,
        },
      })
    } catch (error) {
      console.log(error)
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  /**
   * Get transaction detail by transaction number
   */
  public async getByTransactionNumber({ response, request }: HttpContext) {
    try {
      const dataTransaction = await TransactionEcommerce.query()
        .whereHas('transaction', (trxQuery) => {
          trxQuery.where('transaction_number', request.input('transaction_number'))
        })
        .preload('transaction', (trxLoader) => {
          trxLoader.preload('details', (query) => {
            query.preload('product', (productLoader) => {
              productLoader.preload('medias').preload('categoryType')
            })
          })
        })
        .preload('shipment')
        .orderBy('created_at', 'desc')
        .first()

      if (!dataTransaction) {
        return response.status(400).send({
          message: 'Transaction not found.',
          serve: [],
        })
      }

      // 🔎 Tracking via Delivery API
      let waybill = null
      if (dataTransaction.shipment?.resiNumber) {
        try {
          const client = axios.create({
            baseURL: env.get('KOMERCE_DELIVERY_BASE_URL'),
            headers: {
              Authorization: `Bearer ${env.get('KOMERCE_DELIVERY_API_KEY')}`,
            },
          })

          const res = await client.post('/waybill', {
            waybill: dataTransaction.shipment.resiNumber,
            courier: dataTransaction.shipment.service,
          })

          waybill = res.data?.data ?? null
        } catch (error) {
          console.log('Error fetching waybill:', error.message)
          waybill = null
        }
      }

      return response.status(200).send({
        message: 'success',
        serve: {
          data: dataTransaction,
          waybill,
        },
      })
    } catch (error) {
      console.log(error)
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  private calculateVoucher(data: any, price: string, shippingPrice: string) {
    if (!data) return 0
    if (data.isPercentage === 1) {
      if (data.type === 2) {
        const disc = (parseInt(shippingPrice || '0') * (parseInt(data.percentage || '0') / 100)) | 0
        if (disc > parseInt(data.maxDiscPrice || '0')) {
          return Math.min(parseInt(data.maxDiscPrice || '0'), parseInt(shippingPrice || '0'))
        }
        return Math.min(disc, parseInt(shippingPrice || '0'))
      } else {
        const disc = (parseInt(price || '0') * (parseInt(data.percentage || '0') / 100)) | 0
        return Math.min(disc, parseInt(data.maxDiscPrice || '0'))
      }
    } else {
      if (data.type === 2) {
        return Math.min(parseInt(data.price || '0'), parseInt(shippingPrice || '0'))
      } else {
        return parseInt(data.price || '0')
      }
    }
  }

  private generateGrandTotal(data: any, price: string, shippingPrice: string) {
    return (
      parseInt(price || '0') +
      parseInt(shippingPrice || '0') -
      (this.calculateVoucher(data, price, shippingPrice) || 0)
    )
  }

  private generateTransactionNumber() {
    const date = new Date()
    const tahun = date.getFullYear()
    const bulan = (date.getMonth() + 1).toString().padStart(2, '0')
    const tanggal = date.getDate().toString().padStart(2, '0')
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')

    return `AB${tahun}${bulan}${tanggal}${random}`
  }

  /**
   * Create new ecommerce transaction
   */
  public async create({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const cartIds = request.input('cart_ids') || []
      const shippingPrice = request.input('shipping_price') || '0'
      const voucher = request.input('voucher')

      // ✅ Insurance/protection
      const isProtected = request.input('is_protected') ? 1 : 0
      const protectionFee = request.input('protection_fee') || '0'

      // ✅ Ambil data cart dari DB
      const carts = await TransactionCart.query()
        .whereIn('id', cartIds)
        .where('user_id', auth.user?.id ?? 0)
        .preload('product')
        .preload('variant')

      if (carts.length === 0) {
        await trx.rollback()
        return response.status(400).send({
          message: 'Cart not found or empty.',
          serve: [],
        })
      }

      // ✅ Hitung subtotal dari DB
      const subTotal = carts.reduce((acc, cart) => {
        const qty = cart.qtyCheckout > 0 ? cart.qtyCheckout : cart.qty
        return acc + (Number(cart.price) - Number(cart.discount || 0)) * qty
      }, 0)

      const discount = this.calculateVoucher(voucher, subTotal.toString(), shippingPrice)

      // ✅ Total = produk + ongkir - diskon + protection
      const amount =
        this.generateGrandTotal(voucher, subTotal.toString(), shippingPrice) +
        (isProtected ? parseInt(protectionFee || '0') : 0)

      // STEP 1: create base transaction
      const transaction = new Transaction()
      transaction.amount = amount
      transaction.discount = discount
      transaction.discountType = voucher?.type ?? 0
      transaction.subTotal = subTotal
      transaction.userId = auth.user?.id ?? 0
      transaction.transactionNumber = this.generateTransactionNumber()
      transaction.channel = 'ecommerce'
      await transaction.useTransaction(trx).save()

      // STEP 2: Midtrans Snap
      const parameter = {
        transaction_details: {
          order_id: transaction.transactionNumber,
          gross_amount: transaction.amount,
        },
        customer_details: {
          first_name: auth.user?.name,
          last_name: auth.user?.name,
          email: auth.user?.email,
        },
      }

      const serverKey = env.get('MIDTRANS_SERVER_KEY')
      const authString = Buffer.from(serverKey + ':').toString('base64')

      const { data } = await axios.post(
        env.get('MIDTRANS_ENV') === 'production'
          ? 'https://app.midtrans.com/snap/v1/transactions'
          : 'https://app.sandbox.midtrans.com/snap/v1/transactions',
        parameter,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Basic ${authString}`,
          },
        }
      )

      // STEP 3: create transaction ecommerce
      const transactionEcommerce = new TransactionEcommerce()
      transactionEcommerce.transactionId = transaction.id
      transactionEcommerce.voucherId = voucher?.id ?? null
      transactionEcommerce.tokenMidtrans = data.token
      transactionEcommerce.redirectUrl = data.redirect_url
      transactionEcommerce.userId = auth.user?.id ?? 0
      transactionEcommerce.shippingCost = shippingPrice
      transactionEcommerce.userAddressesId = request.input('user_address_id')
      transactionEcommerce.courierName = request.input('shipping_service_type')
      transactionEcommerce.courierService = request.input('shipping_service')
      await transactionEcommerce.useTransaction(trx).save()

      // STEP 4: reduce voucher stock
      if (voucher) {
        const voucherDb = await Voucher.query().where('id', voucher.id).first()
        if (voucherDb) {
          voucherDb.qty = voucherDb.qty - 1
          await voucherDb.useTransaction(trx).save()
        }
      }

      // STEP 5: process cart → detail
      for (const cart of carts) {
        const qty = cart.qtyCheckout > 0 ? cart.qtyCheckout : cart.qty
        if (!cart.productVariantId) continue
        const productVariant = await ProductVariant.query()
          .preload('product')
          .where('id', cart.productVariantId)
          .first()

        if (productVariant && productVariant.stock < qty) {
          await trx.rollback()
          return response.status(400).send({
            message: `Stock not enough for ${productVariant.product.name}`,
            serve: [],
          })
        }

        if (productVariant) {
          productVariant.stock = productVariant.stock - qty
          await productVariant.useTransaction(trx).save()
        }

        // hapus cart
        await cart.useTransaction(trx).delete()

        // simpan transaction detail
        const transactionDetail = new TransactionDetail()
        transactionDetail.qty = qty
        transactionDetail.price = cart.price
        transactionDetail.amount = (
          (Number(cart.price) - Number(cart.discount || 0)) *
          qty
        ).toString()
        transactionDetail.discount = cart.discount
        transactionDetail.attributes = cart.attributes ?? ''
        transactionDetail.transactionId = transaction.id
        transactionDetail.productId = cart.productId ?? 0
        transactionDetail.productVariantId = cart.productVariantId
        await transactionDetail.useTransaction(trx).save()

        if (cart.productId !== null && cart.productId !== undefined) {
          const product = await Product.query().where('id', cart.productId).first()
          if (product) {
            product.popularity = Number(product.popularity || 0) + 1
            await product.useTransaction(trx).save()
          }
        }
      }

      // STEP 6: shipment cost via Komerce Cost API
      const userAddress = await UserAddress.query()
        .where('id', request.input('user_address_id'))
        .first()

      if (!userAddress) {
        await trx.rollback()
        return response.status(400).send({ message: 'Address not found.', serve: [] })
      }

      if (!userAddress.postalCode) {
        await trx.rollback()
        return response
          .status(400)
          .send({ message: 'Postal code not found. Please update your address.', serve: [] })
      }

      const komerceClient = axios.create({
        baseURL: env.get('KOMERCE_COST_BASE_URL'),
        headers: {
          key: env.get('KOMERCE_COST_API_KEY'),
        },
      })

      const body = qs.stringify({
        origin: Number(env.get('KOMERCE_ORIGIN')),
        originType: env.get('KOMERCE_ORIGIN_TYPE'),
        destination: userAddress.subDistrict,
        destinationType: 'subdistrict',
        weight: 1000,
        courier: request.input('shipping_service_type'),
        price: 'lowest',
      })

      const { data: komerceResp } = await komerceClient.post(
        '/calculate/district/domestic-cost',
        body,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
        }
      )

      if (!komerceResp?.data) {
        await trx.rollback()
        return response
          .status(400)
          .send({ message: 'Subdistrict not found. Please update your address.', serve: [] })
      }

      const transactionShipment = new TransactionShipment()
      transactionShipment.transactionId = transaction.id
      transactionShipment.service = request.input('shipping_service_type')
      transactionShipment.serviceType = request.input('shipping_service')
      transactionShipment.price = shippingPrice
      transactionShipment.address = `${userAddress.address}, ${userAddress.subDistrict}, ${userAddress.district}, ${userAddress.city}, ${userAddress.province}, ${userAddress.postalCode}`
      transactionShipment.provinceId = userAddress.province
      transactionShipment.cityId = userAddress.city
      transactionShipment.districtId = userAddress.district
      transactionShipment.subdistrictId = userAddress.subDistrict
      transactionShipment.postalCode = userAddress.postalCode
      transactionShipment.pic = userAddress.picName
      transactionShipment.pic_phone = userAddress.picPhone
      transactionShipment.estimationArrival = komerceResp.data[0]?.etd || null
      transactionShipment.isProtected = isProtected
      transactionShipment.protectionFee = protectionFee
      await transactionShipment.useTransaction(trx).save()

      await trx.commit()

      return response.status(200).send({
        message: 'Transaction created successfully.',
        serve: {
          ...transaction.toJSON(),
          ecommerce: transactionEcommerce.toJSON(),
          shipment: transactionShipment.toJSON(),
        },
      })
    } catch (e) {
      console.log(e)
      await trx.rollback()
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Webhook Midtrans
   */
  public async webhookMidtrans({ request, response }: HttpContext) {
    const trx = await db.transaction()
    try {
      const transactionNumber = request.input('order_id')
      const transaction = await Transaction.query()
        .where('transaction_number', transactionNumber)
        .first()

      if (!transaction) {
        await trx.commit()
        return response.status(400).json({ message: 'Order not valid.', serve: [] })
      }

      const transactionEcommerce = await TransactionEcommerce.query()
        .where('transaction_id', transaction.id)
        .first()

      const transactionStatus = request.input('transaction_status')
      const fraudStatus = request.input('fraud_status')

      // ✅ Simpan metode pembayaran & receipt
      if (transactionEcommerce) {
        transactionEcommerce.paymentMethod = request.input('payment_type') || null
        transactionEcommerce.receipt =
          request.input('transaction_id') || request.input('va_numbers')?.[0]?.va_number || null
        await transactionEcommerce.useTransaction(trx).save()
      }

      // ✅ Update status transaksi
      if (transactionStatus === 'capture' && fraudStatus === 'accept') {
        transaction.paymentStatus = TransactionStatus.ON_PROCESS.toString()
        await transaction.useTransaction(trx).save()
      }

      if (transactionStatus === 'settlement') {
        transaction.paymentStatus = TransactionStatus.ON_PROCESS.toString()
        await transaction.useTransaction(trx).save()
      }

      await trx.commit()
      return response.status(200).json({ message: 'ok', serve: [] })
    } catch (error) {
      await trx.rollback()
      return response.status(500).json({ message: error.message, serve: [] })
    }
  }

  /**
   * Update status manually
   */
  public async updateStatus({ request, response }: HttpContext) {
    const trx = await db.transaction()
    try {
      const transactionId = request.input('id')
      const transaction = await Transaction.query().where('id', transactionId).first()

      if (!transaction) {
        await trx.commit()
        return response.status(400).json({ message: 'Order not found.', serve: [] })
      }

      transaction.paymentStatus = request.input('status')
      await transaction.useTransaction(trx).save()

      await trx.commit()
      return response.status(200).json({ message: 'success', serve: [] })
    } catch (error) {
      await trx.rollback()
      return response.status(500).json({ message: error.message, serve: [] })
    }
  }
}
