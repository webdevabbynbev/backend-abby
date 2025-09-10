import type { HttpContext } from '@adonisjs/core/http'
import Concern from '#models/concern_option'

export default class ConcernsController {
  /**
   * List all personas (only tag/list)
   */
  public async list({ response }: HttpContext) {
    try {
      const concern = await Concern.query().whereNull('deleted_at')

      return response.ok({
        message: 'Success',
        serve: concern,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  public async show({ response, params }: HttpContext) {
    try {
      const { slug } = params

      const persona = await Concern.query()
        .where('slug', slug)
        .whereNull('deleted_at')
        // pakai scope visible dari Product
        .preload('products', (q) => q.apply((scopes) => scopes.visible()))
        .first()

      if (!persona) {
        return response.notFound({
          message: 'Persona not found',
          serve: null,
        })
      }

      return response.ok({
        message: 'Success',
        serve: persona,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }
}
