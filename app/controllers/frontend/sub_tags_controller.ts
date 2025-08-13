import type { HttpContext } from '@adonisjs/core/http'
import SubTag from '#models/sub_tag'

export default class SubTagsController {
    public async listByPath({ request, response }: HttpContext) {
    try {
      const dataSubTag = await SubTag.query()
        .apply((scopes) => scopes.active())
        .where('path', request.input('path'))
        .preload('detailSubTags', (query) => {
          return query.apply((scopes) => scopes.active())
        })
        .first()

      if (!dataSubTag) {
        return response.status(404).send({
          message: 'Sub Tag not found',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'success',
        serve: dataSubTag,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }
}
