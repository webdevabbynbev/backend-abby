import Product from '#models/product'
import type { HttpContext } from '@adonisjs/core/http'

export default class ProductsController {
  /**
   * ✅ Get product list (with filter + review aggregate)
   */
  public async get({ response, request }: HttpContext) {
    try {
      const queryString = request.qs()

      const name = queryString.name || ''
      const categoryType =
        typeof queryString.category_type === 'string'
          ? queryString.category_type.split(',')
          : queryString.category_type

      const tagId = queryString.tag_id || ''
      const subTagId = queryString.sub_tag_id || ''
      const detailSubTag =
        typeof queryString.detail_sub_tag === 'string'
          ? queryString.detail_sub_tag.split(',')
          : queryString.detail_sub_tag

      const sortBy = queryString.field || 'position'
      const sortType = queryString.value || 'ASC'
      const page = isNaN(parseInt(queryString.page)) ? 1 : parseInt(queryString.page)
      const perPage = isNaN(parseInt(queryString.per_page)) ? 10 : parseInt(queryString.per_page)

      // get server time +7 (WIB)
      const now = new Date()
      now.setHours(now.getHours() + 7)
      const dateString = now.toISOString().slice(0, 19).replace('T', ' ')

      const productsQuery = await Product.query()
        .apply((scopes) => scopes.active())
        .where('products.status', '!=', 0) // exclude draft (status=0)
        .if(name, (query) => query.where('products.name', 'like', `%${name}%`))
        .if(categoryType, (query) => query.whereIn('products.category_type_id', categoryType))
        .if(tagId, (query) => query.where('products.tag_id', tagId))
        .if(subTagId, (query) => query.where('products.sub_tag_id', subTagId))
        .if(detailSubTag, (query) => query.whereIn('products.detail_sub_tag_id', detailSubTag))
        .withCount('reviews', (reviewQuery) => reviewQuery.as('review_count'))
        .withAggregate('reviews', (reviewQuery) => reviewQuery.avg('rating').as('avg_rating'))
        .preload('reviews', (reviewQuery) => {
          reviewQuery
            .whereNull('deleted_at')
            .orderBy('created_at', 'desc')
            .preload('user', (userQuery) =>
              userQuery.select(['id', 'first_name', 'last_name', 'photo_profile'])
            )
        })
        .preload('discounts', (query) =>
          query.where('start_date', '<=', dateString).where('end_date', '>=', dateString)
        )
        .preload('medias')
        .preload('categoryType')
        .preload('brand')
        .preload('persona')
        .preload('tags')
        .preload('concerns')
        .orderByRaw(
          `products.${sortBy === 'created_at' ? 'position' : sortBy} IS NULL, 
           products.${sortBy === 'created_at' ? 'position' : sortBy} ${(sortBy === 'created_at' ? 'ASC' : sortType).toLowerCase()}`
        )
        .paginate(page, perPage)

      const { meta, data } = productsQuery.toJSON()

      return response.status(200).send({
        message: 'success',
        serve: { data, ...meta },
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async show({ response, params }: HttpContext) {
    try {
      // pastikan params['*'] jadi string (gabung pakai '/')
      const rawPath = params['*']
      const path = Array.isArray(rawPath) ? rawPath.join('/') : rawPath

      const now = new Date()
      now.setHours(now.getHours() + 7)
      const dateString = now.toISOString().slice(0, 19).replace('T', ' ')

      const product = await Product.query()
        .apply((scopes) => scopes.active())
        .where('products.path', path) // sekarang string aman
        .where('products.status', '!=', 0) // exclude draft (pakai integer)
        .withCount('reviews', (reviewQuery) => reviewQuery.as('review_count'))
        .withAggregate('reviews', (reviewQuery) => reviewQuery.avg('rating').as('avg_rating'))
        .preload('reviews', (reviewQuery) => {
          reviewQuery
            .whereNull('deleted_at')
            .orderBy('created_at', 'desc')
            .preload('user', (userQuery) =>
              userQuery.select(['id', 'first_name', 'last_name', 'photo_profile'])
            )
        })
        .preload('variants', (variantLoader) => {
          variantLoader.preload('attributes', (attributeLoader) => {
            attributeLoader
              .whereNull('attribute_values.deleted_at')
              .preload('attribute', (query) => query.whereNull('attributes.deleted_at'))
          })
        })
        .preload('discounts', (query) =>
          query.where('start_date', '<=', dateString).where('end_date', '>=', dateString)
        )
        .preload('medias')
        .preload('categoryType')
        .preload('brand')
        .preload('persona')
        .preload('tags')
        .preload('concerns')
        .first()

      if (!product) {
        return response.status(404).send({
          message: 'Product not found',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'success',
        serve: product,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }
}
