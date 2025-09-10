import type { HttpContext } from '@adonisjs/core/http'
import _ from 'lodash'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import axios from 'axios'
import Voucher from '#models/voucher'
import ProductVariant from '#models/product_variant'
import TransactionCart from '#models/transaction_cart'
import TransactionDetail from '#models/transaction_detail'
import Product from '#models/product'
import TransactionShipment from '#models/transaction_shipment'
import UserAddress from '#models/user_address'
import env from '#start/env'
import User from '#models/user'

const BASE_URL = env.get('KOMERCE_BASE_URL')
const API_KEY = env.get('KOMERCE_COST_API_KEY')

export default class TransactionsController {
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

      const dataTransaction = await Transaction.query()
        .where('transactions.user_id', auth.user?.id ?? 0)
        .if(transactionNumber, (query) => {
          query.where('transactions.transaction_number', transactionNumber)
        })
        .if(status, (query) => {
          query.where('transactions.status', status)
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
        .preload('shipment')
        .orderBy(`transactions.${sortBy}`, sortType)
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

  public async create({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const transaction = new Transaction()
      transaction.amount =
        this.generateGrandTotal(
          request.input('voucher'),
          _.sumBy(
            request.input('carts'),
            (r: { amount: string; qtyCheckout: number; price: string; discount: string }) =>
              (parseInt(r.price || '0') - parseInt(r.discount || '0')) * r.qtyCheckout
          ).toString(),
          request.input('shipping_price')
        ).toString() || '0'
      transaction.discount =
        this.calculateVoucher(
          request.input('voucher'),
          _.sumBy(
            request.input('carts'),
            (r: { amount: string; qtyCheckout: number; price: string; discount: string }) =>
              (parseInt(r.price || '0') - parseInt(r.discount || '0')) * r.qtyCheckout
          ).toString(),
          request.input('shipping_price')
        ).toString() || '0'
      transaction.discountType = request.input('voucher')?.type ?? 0
      transaction.subTotal =
        _.sumBy(
          request.input('carts'),
          (r: { amount: string; qtyCheckout: number; price: string; discount: string }) =>
            (parseInt(r.price || '0') - parseInt(r.discount || '0')) * r.qtyCheckout
        ).toString() || '0'
      transaction.userId = auth.user?.id ?? 0
      transaction.voucherId = request.input('voucher')?.id ?? null
      transaction.transactionNumber = this.generateTransactionNumber()

      let parameter = {
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

      transaction.tokenMidtrans = data.token
      transaction.redirectUrl = data.redirect_url

      await transaction.useTransaction(trx).save()

      if (request.input('voucher')) {
        const voucher = await Voucher.query().where('id', request.input('voucher').id).first()
        if (voucher) {
          voucher.qty = voucher.qty - 1
          await voucher.useTransaction(trx).save()
        }
      }

      if (request.input('carts')?.length > 0) {
        for (const cart of request.input('carts')) {
          const productVariant = await ProductVariant.query()
            .preload('product')
            .where('id', cart.productVariantId)
            .first()
          if (productVariant) {
            if (productVariant.stock < cart.qtyCheckout) {
              await trx.rollback()
              return response.status(400).send({
                message:
                  'Stock not enough for ' +
                  productVariant.product.name +
                  ' with variant ' +
                  cart?.attributes
                    ? Object.keys(cart?.attributes)
                        ?.map((v) => {
                          return `${v}: ${cart?.attributes[v]}`
                        })
                        .join(', ')
                    : null,
                serve: [],
              })
            }

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

      const { data: rajaongkir } = await axios.get(`${BASE_URL}/destination/sub-district/`, {
        params: {
          id: userAddress.subDistrict?.toString(),
          city: userAddress.city?.toString(),
        },
        headers: {
          key: env.get('RAJAONGKIR_KEY'),
        },
      })

      if (rajaongkir?.rajaongkir?.results?.length === 0) {
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
      transactionShipment.price = request.input('shipping_price') || '0'
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
      transactionShipment.pic = userAddress.picName
      transactionShipment.pic_phone = userAddress.picPhone
      transactionShipment.provinceId = userAddress.province
      transactionShipment.cityId = userAddress.city
      transactionShipment.districtId = userAddress.district
      transactionShipment.subdistrictId = userAddress.subDistrict
      transactionShipment.postalCode = userAddress.postalCode
      await transactionShipment.useTransaction(trx).save()

      await transaction.sendTransactionEmail(
        { email: auth.user?.email ?? '', name: auth.user?.name ?? '' },
        'pending',
        'emails/transaction_pending'
      )

      await transaction.sendTransactionEmail(
        { email: env.get('SMTP_USERNAME') as string, name: 'Admin Abby N Bev' },
        'pending',
        'emails/transaction_pending',
        true
      )
      await trx.commit()
      return response.status(200).send({
        message: 'Transaction created successfully.',
        serve: transaction,
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
            if (disc > parseInt(shippingPrice || '0')) {
              return parseInt(shippingPrice || '0')
            } else {
              return disc
            }
          }
        } else {
          const disc = parseInt(
            (parseInt(price || '0') * (parseInt(data.percentage || '0') / 100)).toString()
          )
          if (disc > parseInt(data.maxDiscPrice || '0')) {
            return parseInt(data.maxDiscPrice || '0')
          } else {
            return disc
          }
        }
      } else {
        if (data.type === 2) {
          if (parseInt(data.price || '0') > parseInt(shippingPrice || '0')) {
            return parseInt(shippingPrice || '0')
          } else {
            return parseInt(data.price || '0')
          }
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
}
