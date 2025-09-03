import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'

export default class TagsController {
  /**
   * List all tags
   */
  public async list({ response }: HttpContext) {
    try {
      const tags = await Tag.query().whereNull('deleted_at')

      return response.ok({
        message: 'Success',
        serve: tags,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Show tag detail + products
   */
  public async show({ response, params }: HttpContext) {
    try {
      const { slug } = params

      const tag = await Tag.query()
        .where('slug', slug)
        .whereNull('deleted_at')
        .preload('products', (q) => {
          q.whereNull('products.deleted_at').whereIn('products.status', ['normal', 'war'])
        })
        .first()

      if (!tag) {
        return response.notFound({
          message: 'Tag not found',
          serve: null,
        })
      }

      return response.ok({
        message: 'Success',
        serve: tag,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }
}
