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
import User from '#models/user'
import axios from 'axios'
import env from '#start/env'
import { TransactionStatus } from '../../enums/transaction_status.js'
import _ from 'lodash'

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

          if (transactionNumber) {
            trxQuery.where('transaction_number', transactionNumber)
          }

          if (status) {
            trxQuery.where('status', status)
          }

          if (startDate) {
            trxQuery.where('created_at', '>=', startDate)
          }

          if (endDate) {
            trxQuery.where('created_at', '<=', endDate)
          }
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

      const meta = dataTransaction.toJSON().meta

      return response.status(200).send({
        message: 'success',
        serve: {
          data: dataTransaction?.toJSON().data,
          ...meta,
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
        .where('transaction_number', request.input('transaction_number'))
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

      let waybill = null
      if (dataTransaction.shipment?.resiNumber) {
        try {
          const client = axios.create({
            baseURL: 'https://pro.rajaongkir.com',
          })

          const res = await client.post(
            '/api/waybill',
            {
              waybill: dataTransaction.shipment.resiNumber,
              courier: dataTransaction.shipment.service,
            },
            {
              headers: {
                key: env.get('RAJAONGKIR_KEY'),
              },
            }
          )

          const shipping = res.data?.rajaongkir?.result
          waybill = shipping
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
    if (data) {
      if (data.isPercentage === 1) {
        if (data.type === 2) {
          const disc = parseInt(
            (parseInt(shippingPrice || '0') * (parseInt(data.percentage || '0') / 100)).toString()
          )
          if (disc > parseInt(data.maxDiscPrice || '0')) {
            if (parseInt(data.maxDiscPrice || '0') > parseInt(shippingPrice || '0')) {
              return parseInt(shippingPrice || '0')
            } else {
              return parseInt(data.maxDiscPrice || '0')
            }
          } else {
            return disc > parseInt(shippingPrice || '0') ? parseInt(shippingPrice || '0') : disc
          }
        } else {
          const disc = parseInt(
            (parseInt(price || '0') * (parseInt(data.percentage || '0') / 100)).toString()
          )
          return disc > parseInt(data.maxDiscPrice || '0')
            ? parseInt(data.maxDiscPrice || '0')
            : disc
        }
      } else {
        if (data.type === 2) {
          return parseInt(data.price || '0') > parseInt(shippingPrice || '0')
            ? parseInt(shippingPrice || '0')
            : parseInt(data.price || '0')
        } else {
          return parseInt(data.price || '0')
        }
      }
    }
    return 0
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

    return `POV${tahun}${bulan}${tanggal}${random}`
  }

  /**
   * Create new ecommerce transaction
   */
  public async create({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const carts = request.input('carts') || []
      const shippingPrice = request.input('shipping_price') || '0'
      const voucher = request.input('voucher')

      const subTotal = _.sumBy(
        carts,
        (r: { qtyCheckout: number; price: string; discount: string }) =>
          (parseInt(r.price || '0') - parseInt(r.discount || '0')) * r.qtyCheckout
      )

      const discount = this.calculateVoucher(voucher, subTotal.toString(), shippingPrice)
      const amount = this.generateGrandTotal(voucher, subTotal.toString(), shippingPrice)

      // STEP 1: create base transaction
      const transaction = new Transaction()
      transaction.amount = amount
      transaction.discount = discount
      transaction.discountType = voucher?.type ?? 0
      transaction.subTotal = subTotal
      transaction.userId = auth.user?.id ?? 0
      transaction.transactionNumber = this.generateTransactionNumber()

      await transaction.useTransaction(trx).save()

      // STEP 2: Midtrans snap untuk ecommerce
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
      await transactionEcommerce.useTransaction(trx).save()

      // STEP 4: kurangi stock voucher kalau ada
      if (voucher) {
        const voucherDb = await Voucher.query().where('id', voucher.id).first()
        if (voucherDb) {
          voucherDb.qty = voucherDb.qty - 1
          await voucherDb.useTransaction(trx).save()
        }
      }

      // STEP 5: proses cart → detail
      if (carts.length > 0) {
        for (const cart of carts) {
          const productVariant = await ProductVariant.query()
            .preload('product')
            .where('id', cart.productVariantId)
            .first()

          if (productVariant && productVariant.stock < cart.qtyCheckout) {
            await trx.rollback()
            return response.status(400).send({
              message: `Stock not enough for ${productVariant.product.name}`,
              serve: [],
            })
          }

          if (productVariant) {
            productVariant.stock = productVariant.stock - cart.qtyCheckout
            await productVariant.useTransaction(trx).save()
          }

          const transactionCart = await TransactionCart.query().where('id', cart.id).first()
          if (transactionCart) {
            await transactionCart.useTransaction(trx).delete()
          }

          const transactionDetail = new TransactionDetail()
          transactionDetail.qty = cart.qtyCheckout
          transactionDetail.price = cart.price
          transactionDetail.amount = (
            (parseInt(cart.price || '0') - parseInt(cart.discount || '0')) *
            cart.qtyCheckout
          ).toString()
          transactionDetail.discount = cart.discount
          transactionDetail.attributes = cart.attributes
          transactionDetail.transactionId = transaction.id
          transactionDetail.productId = cart.productId
          transactionDetail.productVariantId = cart.productVariantId
          await transactionDetail.useTransaction(trx).save()

          const product = await Product.query().where('id', cart.productId).first()
          if (product) {
            product.popularity = (product.popularity || 0) + 1
            await product.useTransaction(trx).save()
          }
        }
      }

      // STEP 6: shipment
      const userAddress = await UserAddress.query()
        .where('id', request.input('user_address_id'))
        .first()

      if (!userAddress) {
        await trx.rollback()
        return response.status(400).send({
          message: 'Address not found.',
          serve: [],
        })
      }

      if (!userAddress.postalCode) {
        await trx.rollback()
        return response.status(400).send({
          message: 'Postal code not found. Please update your address.',
          serve: [],
        })
      }

      const { data: rajaongkir } = await axios.get('https://pro.rajaongkir.com/api/subdistrict', {
        params: {
          id: userAddress.subDistrict?.toString(),
          city: userAddress.city?.toString(),
        },
        headers: {
          key: env.get('RAJAONGKIR_KEY'),
        },
      })

      if (!rajaongkir?.rajaongkir?.results) {
        await trx.rollback()
        return response.status(400).send({
          message: 'Subdistrict not found. Please update your address.',
          serve: [],
        })
      }

      const transactionShipment = new TransactionShipment()
      transactionShipment.transactionId = transaction.id
      transactionShipment.service = request.input('shipping_service_type')
      transactionShipment.serviceType = request.input('shipping_service')
      transactionShipment.price = shippingPrice
      transactionShipment.address =
        userAddress.address +
        ' -- ' +
        rajaongkir?.rajaongkir?.results?.province +
        ' -- ' +
        rajaongkir?.rajaongkir?.results?.type +
        ' ' +
        rajaongkir?.rajaongkir?.results?.city +
        ' -- ' +
        rajaongkir?.rajaongkir?.results?.district +
        ' -- ' +
        rajaongkir?.rajaongkir?.results?.subdistrict_name +
        ' -- ' +
        userAddress.postalCode
      transactionShipment.provinceId = userAddress.province
      transactionShipment.cityId = userAddress.city
      transactionShipment.districtId = userAddress.district
      transactionShipment.subdistrictId = userAddress.subDistrict
      transactionShipment.postalCode = userAddress.postalCode
      transactionShipment.pic = userAddress.picName
      transactionShipment.pic_phone = userAddress.picPhone
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
        return response.status(400).json({
          message: 'Order not valid.',
          serve: [],
        })
      }

      const user = await User.find(transaction.userId)
      if (!user) {
        await trx.commit()
        return response.status(400).json({
          message: 'Order not valid.',
          serve: [],
        })
      }

      const transactionStatus = request.input('transaction_status')
      const fraudStatus = request.input('fraud_status')

      if (transactionStatus === 'capture' && fraudStatus === 'accept') {
        transaction.paymentStatus = TransactionStatus.ON_PROCESS.toString()
        await transaction.useTransaction(trx).save()
      }

      if (transactionStatus === 'settlement') {
        transaction.paymentStatus = TransactionStatus.ON_PROCESS.toString()
        await transaction.useTransaction(trx).save()
      }

      await trx.commit()
      return response.status(200).json({
        message: 'ok',
        serve: [],
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).json({
        message: error.message,
        serve: [],
      })
    }
  }

  /**
   * Update status manually (admin)
   */
  public async updateStatus({ request, response }: HttpContext) {
    const trx = await db.transaction()
    try {
      const transactionId = request.input('id')
      const transaction = await Transaction.query().where('id', transactionId).first()

      if (!transaction) {
        await trx.commit()
        return response.status(400).json({
          message: 'Order not found.',
          serve: [],
        })
      }

      transaction.paymentStatus = request.input('status')
      await transaction.useTransaction(trx).save()

      await trx.commit()
      return response.status(200).json({
        message: 'success',
        serve: [],
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).json({
        message: error.message,
        serve: [],
      })
    }
  }
}
