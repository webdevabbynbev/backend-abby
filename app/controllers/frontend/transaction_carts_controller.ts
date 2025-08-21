import Product from '#models/product'
import ProductDiscount from '#models/product_discount'
import ProductVariant from '#models/product_variant'
import TransactionCart from '#models/transaction_cart'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class TransactionCartsController {
  private calculatePrice({
    type,
    price,
    value,
    maxValue,
  }: {
    type: number
    price: string
    value: string
    maxValue: string
  }) {
    if (type === 1) {
      const disc = parseInt(price) * (parseInt(value) / 100)
      if (disc > parseInt(maxValue)) {
        return { price: parseInt(price) - parseInt(maxValue), disc: disc }
      } else {
        return { price: parseInt(price) - disc, disc: disc }
      }
    } else {
      return { price: parseInt(price) - parseInt(value), disc: parseInt(value) }
    }
  }

  public async get({ response, request, auth }: HttpContext) {
    try {
      const queryString = request.qs()
      const sortBy = queryString.field || 'created_at'
      const sortType = queryString.value || 'DESC'
      const isCheckout = queryString.is_checkout ?? ''
      const page = isNaN(parseInt(queryString.page)) ? 1 : parseInt(queryString.page)
      const per_page = isNaN(parseInt(queryString.per_page)) ? 10 : parseInt(queryString.per_page)

      const dataCart = await TransactionCart.query()
        .where('transaction_carts.user_id', auth.user?.id ?? 0)
        .if(isCheckout, (query) => {
          query.where('transaction_carts.is_checkout', isCheckout)
        })
        .preload('product', (query) => {
          return query
            .preload('medias')
            .preload('tag')
            .preload('subTag')
            .preload('detailSubTag')
        })
        .preload('variant', (variantLoader) => {
          variantLoader.preload('attributes', (attributeLoader) => {
            attributeLoader.preload('attribute') // Preload detail nilai atribut
          })
        })
        .orderBy(`transaction_carts.${sortBy}`, sortType)
        .paginate(page, per_page)

      const meta = dataCart.toJSON().meta

      return response.status(200).send({
        message: '',
        serve: {
          data: dataCart?.toJSON().data,
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
      const now = new Date()
      now.setHours(now.getHours() + 7)
      const dateString = now.toISOString().slice(0, 19).replace('T', ' ')

      const existingCart = await TransactionCart.query()
        .where('user_id', auth.user?.id ?? 0)
        .where('product_id', request.input('product_id'))
        .where('product_variant_id', request.input('variant_id'))
        .first()

      if (existingCart) {
        existingCart.qty += request.input('qty')
        if (request.input('is_buy_now')) {
          existingCart.qtyCheckout += request.input('qty')
          existingCart.isCheckout = 1
        }
        await existingCart.save()
        await trx.commit()
        return response.status(200).send({
          message: 'Quantity updated in cart.',
          serve: existingCart,
        })
      }

      const dataCart = new TransactionCart()
      const dataProduct = await Product.query().where('id', request.input('product_id')).first()
      if (!dataProduct) {
        await trx.commit()
        return response.status(400).send({
          message: 'Product not found.',
          serve: null,
        })
      }

      const dataProductVariant = await ProductVariant.query()
        .where('id', request.input('variant_id'))
        .first()
      if (!dataProductVariant) {
        await trx.commit()
        return response.status(400).send({
          message: 'Product not found.',
          serve: null,
        })
      }

      if (dataProductVariant.stock < request.input('qty')) {
        await trx.commit()
        return response.status(400).send({
          message:
            'Stock not enough for ' +
            dataProduct.name +
            ' with variant ' +
            JSON.stringify(request.input('attributes')),
          serve: null,
        })
      }

      dataCart.qty = request.input('qty')
      if (request.input('is_buy_now')) {
        dataCart.qtyCheckout = request.input('qty')
        dataCart.isCheckout = 1
      }
      dataCart.price = dataProductVariant.price || ''

      const dataProductDisc = await ProductDiscount.query()
        .where('product_id', request.input('product_id'))
        .where('start_date', '<=', dateString)
        .where('end_date', '>=', dateString)
        .first()
      if (dataProductDisc) {
        dataCart.discount = this.calculatePrice({
          type: dataProductDisc.type,
          price: dataProductVariant.price,
          value: dataProductDisc.value,
          maxValue: dataProductDisc.maxValue,
        }).disc.toString()

        dataCart.amount = (
          this.calculatePrice({
            type: dataProductDisc.type,
            price: dataProductVariant.price,
            value: dataProductDisc.value,
            maxValue: dataProductDisc.maxValue,
          }).price * dataCart.qty
        ).toString()
      } else {
        dataCart.amount = (parseInt(dataProductVariant.price) * dataCart.qty).toString()
      }

      dataCart.productVariantId = request.input('variant_id')
      dataCart.attributes = JSON.stringify(request.input('attributes'))
      dataCart.productId = request.input('product_id')
      dataCart.userId = auth.user?.id ?? 0
      await dataCart.save()

      await trx.commit()
      return response.status(200).send({
        message: 'Successfully added to cart.',
        serve: dataProduct,
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async getTotal({ response, auth }: HttpContext) {
    try {
      const dataCart = await TransactionCart.query()
        .where('user_id', auth.user?.id ?? 0)
        .where('is_checkout', '!=', 2)
        .first()

      return response.status(200).send({
        message: 'success',
        serve: dataCart,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async update({ response, request }: HttpContext) {
    const trx = await db.transaction()
    try {
      if (request.input('carts')?.length > 0) {
        for (const value of request.input('carts')) {
          const dataCart = await TransactionCart.query().where('id', value.id).first()
          if (dataCart) {
            dataCart.qtyCheckout = value.qty
            dataCart.isCheckout = 1
            await dataCart.save()
          }
        }
      }

      await trx.commit()
      return response.status(200).send({
        message: '',
        serve: [],
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

  public async delete({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const dataCart = await TransactionCart.query()
        .where('id', request.input('id'))
        .where('user_id', auth.user?.id ?? 0)
        .first()
      if (!dataCart) {
        return response.status(400).send({
          message: 'Delete cart failed.',
          serve: [],
        })
      }
      await dataCart.delete()
      await trx.commit()
      return response.status(200).send({
        message: '',
        serve: [],
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
}
