import type { HttpContext } from '@adonisjs/core/http'
import DetailSubTag from '#models/detail_sub_tag'

export default class DetailSubTagsController {
    public async listByPath({ request, response }: HttpContext) {
    try {
      const dataDetailSubTag = await DetailSubTag.query()
        .apply((scopes) => scopes.active())
        .where('path', request.input('path'))
        .where('sub_tag_id', request.input('sub_tag_id'))
        .first()

      if (!dataDetailSubTag) {
        return response.status(404).send({
          message: 'Detail Sub Tag not found',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'success',
        serve: dataDetailSubTag,
      })
    } catch (error) {
      console.error(error)
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }
}