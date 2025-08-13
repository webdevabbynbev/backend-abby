import type { HttpContext } from '@adonisjs/core/http'
import CategoryType from '#models/category_type'

export default class CategoryTypesController {
    public async list({ response }: HttpContext) {
    try {
      const tags = await CategoryType.query().apply((query) => query.active())
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