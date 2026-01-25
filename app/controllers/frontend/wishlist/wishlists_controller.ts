import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Wishlist from '#models/wishlist'
import ProductOnline from '#models/product_online'

export default class WishlistsController {
  /**
   * GET /api/v1/wishlists
   */
  public async get({ response, request, auth }: HttpContext) {
    try {
      // =========================
      // AUTH
      // =========================
      const user = auth.user
      if (!user) {
        return response.status(401).send({
          message: 'Unauthorized',
          serve: null,
        })
      }

      // =========================
      // QUERY PARAMS (SAFE)
      // =========================
      const qs = request.qs()

      const sortFieldMap: Record<string, string> = {
        createdAt: 'created_at',
        id: 'id',
      }

      const sortBy = sortFieldMap[qs.field] ?? 'created_at'

      type SortDirection = 'asc' | 'desc'
      const sortType: SortDirection = String(qs.value).toLowerCase() === 'asc' ? 'asc' : 'desc'

      const page = Number.isInteger(Number(qs.page)) && Number(qs.page) > 0 ? Number(qs.page) : 1

      const perPage =
        Number.isInteger(Number(qs.per_page)) && Number(qs.per_page) > 0 ? Number(qs.per_page) : 10

      // =========================
      // QUERY
      // =========================
      const wishlistPaginator = await Wishlist.query()
        .where('user_id', user.id)
        .preload('product', (query) => {
          query.preload('medias').preload('tags')
        })
        .orderBy(sortBy, sortType)
        .paginate(page, perPage)

      const { data, meta } = wishlistPaginator.toJSON()

      return response.status(200).send({
        message: '',
        serve: {
          data,
          ...meta,
        },
      })
    } catch (error: any) {
      console.error('[WISHLIST GET ERROR]', error)

      return response.status(500).send({
        message: 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * GET /api/v1/wishlists/list
   */
  public async list({ response, auth }: HttpContext) {
    try {
      const user = auth.user
      if (!user) {
        return response.status(401).send({
          message: 'Unauthorized',
          serve: null,
        })
      }

      const data = await Wishlist.query()
        .where('user_id', user.id)
        .preload('product', (query) => {
          query.preload('medias')
        })

      return response.status(200).send({
        message: '',
        serve: data,
      })
    } catch (error: any) {
      console.error('[WISHLIST LIST ERROR]', error)

      return response.status(500).send({
        message: 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * POST /api/v1/wishlists
   */
  public async create({ response, request, auth }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.status(401).send({
        message: 'Unauthorized',
        serve: null,
      })
    }

    const productId = request.input('product_id')

    if (!productId) {
      return response.status(400).send({
        message: 'product_id is required',
        serve: null,
      })
    }

    try {
      const productOnline = await db.transaction(async (trx) => {
        const product = await ProductOnline.query({ client: trx })
          .where('product_id', productId)
          .where('is_active', true)
          .preload('product', (p) => p.preload('medias'))
          .first()

        if (!product) {
          const err: any = new Error('Product not available online.')
          err.httpStatus = 400
          throw err
        }

        const exists = await Wishlist.query({ client: trx })
          .where('product_id', productId)
          .where('user_id', user.id)
          .first()

        if (!exists) {
          await Wishlist.create(
            {
              productId,
              userId: user.id,
            },
            { client: trx }
          )
        }

        return product
      })

      return response.status(200).send({
        message: 'Added to wishlist.',
        serve: productOnline,
      })
    } catch (error: any) {
      console.error('[WISHLIST CREATE ERROR]', error)

      return response.status(error?.httpStatus || 500).send({
        message: error.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * DELETE /api/v1/wishlists
   */
  public async delete({ response, request, auth }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.status(401).send({
        message: 'Unauthorized',
        serve: null,
      })
    }

    const productId = request.input('product_id')

    if (!productId) {
      return response.status(400).send({
        message: 'product_id is required',
        serve: null,
      })
    }

    try {
      await db.transaction(async (trx) => {
        const wishlist = await Wishlist.query({ client: trx })
          .where('product_id', productId)
          .where('user_id', user.id)
          .first()

        if (!wishlist) {
          const err: any = new Error('Wishlist not found.')
          err.httpStatus = 400
          throw err
        }

        await wishlist.useTransaction(trx).delete()
      })

      return response.status(200).send({
        message: 'Success Delete',
        serve: null,
      })
    } catch (error: any) {
      console.error('[WISHLIST DELETE ERROR]', error)

      return response.status(error?.httpStatus || 500).send({
        message: error.message || 'Internal Server Error',
        serve: null,
      })
    }
  }
}
