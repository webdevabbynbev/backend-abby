import type { HttpContext } from '@adonisjs/core/http'
import TagProducts from '#models/tag_product'

export default class TagProductsController {
    public async list({ response }: HttpContext) {
        try {
          const tags = await TagProducts.query().apply((query) => query.active())
          return response.status(200).send({
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
}