import type { HttpContext } from '@adonisjs/core/http'
import Concern from '#models/concern'

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
      
            const concern = await Concern.query()
              .where('slug', slug)
              .whereNull('deleted_at')
              .preload('products', (q) => {
                q.whereNull('deleted_at').andWhere('is_active', 1)
              })
              .first()
      
            if (!concern) {
              return response.notFound({
                message: 'Persona not found',
                serve: null,
              })
            }
      
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
}