import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'

export default class TagsController {
    /**
   * Ambil semua Tag + SubTag + DetailSubTag
   */
  public async list({ response }: HttpContext) {
    try {
      const dataTags = await Tag.query()
        .apply((scopes) => scopes.active())
        .preload('subTags', (query) => {
          return query
            .apply((scopes) => scopes.active())
            .preload('detailSubTags', (detailQuery) => {
              return detailQuery.apply((scopes) => scopes.active())
            })
        })
        .orderBy('tags.name', 'asc')

      return response.status(200).send({
        message: 'success',
        serve: dataTags,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  /**
   * Ambil 1 Tag berdasarkan path (misalnya untuk halaman detail kategori)
   */
  public async listByPath({ request, response }: HttpContext) {
    try {
      const subTagId = request.input('sub_tag_id') ?? ''

      const dataTag = await Tag.query()
        .apply((scopes) => scopes.active())
        .where('path', request.input('path'))
        .preload('subTags', (query) => {
          return query
            // Kalau mau filter berdasarkan sub_tag_id
            .if(subTagId, (subQuery) => {
              subQuery.where('sub_tags.id', subTagId)
            })
            .apply((scopes) => scopes.active())
            .preload('detailSubTags', (detailQuery) => {
              return detailQuery.apply((scopes) => scopes.active())
            })
        })
        .first()

      if (!dataTag) {
        return response.status(404).send({
          message: 'Tag not found',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'success',
        serve: dataTag,
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }
}