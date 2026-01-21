import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Wishlist from '#models/wishlist'
import ProductOnline from '#models/product_online'

export default class WishlistsController {
  public async get({ response, request, auth }: HttpContext) {
    try {
      const userId = auth.user?.id
      if (!userId) {
        return response.status(401).send({
          message: 'Unauthorized',
          serve: null,
        })
      }

      const queryString = request.qs()
      const sortBy = queryString.field || 'created_at'
      const sortType = queryString.value || 'DESC'
      const page = isNaN(parseInt(queryString.page)) ? 1 : parseInt(queryString.page)
      const perPage = isNaN(parseInt(queryString.per_page)) ? 10 : parseInt(queryString.per_page)

      const dataWishlist = await Wishlist.query()
        .where('user_id', userId)
        .preload('product', (query) => {
          return query.preload('medias').preload('tags')
        })
        .orderBy(`${sortBy}`, sortType)
        .paginate(page, perPage)

      const meta = dataWishlist.toJSON().meta

      return response.status(200).send({
        message: '',
        serve: {
          data: dataWishlist.toJSON().data,
          ...meta,
        },
      })
    } catch (error: any) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async list({ response, auth }: HttpContext) {
    try {
      const userId = auth.user?.id
      if (!userId) {
        return response.status(401).send({
          message: 'Unauthorized',
          serve: null,
        })
      }

      const dataWishlist = await Wishlist.query()
        .where('user_id', userId)
        .preload('product', (query) => {
          return query.preload('medias')
        })

      return response.status(200).send({
        message: '',
        serve: dataWishlist,
      })
    } catch (error: any) {
      console.log(error)
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async create({ response, request, auth }: HttpContext) {
    const userId = auth.user?.id
    if (!userId) {
      return response.status(401).send({
        message: 'Unauthorized',
        serve: null,
      })
    }

    const productId = request.input('product_id')

    try {
      const result = await db.transaction(async (trx) => {
        const productOnline = await ProductOnline.query({ client: trx })
          .where('product_id', productId)
          .where('is_active', true)
          .preload('product', (p) => p.preload('medias'))
          .first()

        if (!productOnline) {
          const err: any = new Error('Product not available online.')
          err.httpStatus = 400
          throw err
        }

        const existingWishlist = await Wishlist.query({ client: trx })
          .where('product_id', productId)
          .where('user_id', userId)
          .first()

        if (!existingWishlist) {
          const wishlist = new Wishlist()
          wishlist.productId = productId
          // ✅ FIX: jangan set wishlist.id (PK). Set userId
          wishlist.userId = userId
          await wishlist.useTransaction(trx).save()
        }

        return productOnline
      })

      return response.status(200).send({
        message: 'Added to wishlist.',
        serve: result,
      })
    } catch (error: any) {
      return response.status(error?.httpStatus || 500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async delete({ response, request, auth }: HttpContext) {
    const userId = auth.user?.id
    if (!userId) {
      return response.status(401).send({
        message: 'Unauthorized',
        serve: null,
      })
    }

    const productId = request.input('product_id')

    try {
      await db.transaction(async (trx) => {
        const dataWishlist = await Wishlist.query({ client: trx })
          .where('product_id', productId)
          .where('user_id', userId)
          .first()

        if (!dataWishlist) {
          const err: any = new Error('Wishlist not found.')
          err.httpStatus = 400
          throw err
        }

        await dataWishlist.useTransaction(trx).delete()
      })

      return response.status(200).send({
        message: 'Success Delete',
        serve: [],
      })
    } catch (error: any) {
      console.log(error)
      return response.status(error?.httpStatus || 500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }
}
