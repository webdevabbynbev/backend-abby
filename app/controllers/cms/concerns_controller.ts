import type { HttpContext } from '@adonisjs/core/http'
import Concern from '#models/concern'
import { generateSlug } from '../../utils/helpers.js'
import { createConcernValidator, updateConcernValidator } from '#validators/concern'

export default class ConcernsController {
  /**
   * List Concerns (pagination + search)
   */
  public async index({ request, response }: HttpContext) {
    try {
      const { q, page = 1, per_page = 10 } = request.qs()

      const concerns = await Concern.query()
        .apply((scopes) => scopes.active())
        .if(q, (query) => {
          query.whereILike('name', `%${q}%`)
        })
        .preload('options', (query) => {
          query.apply((scopes) => scopes.active()).orderBy('position', 'asc')
        })
        .paginate(Number(page), Number(per_page))

      return response.ok({
        message: 'Success',
        serve: {
          data: concerns.toJSON().data,
          ...concerns.toJSON().meta,
        },
      })
    } catch (e) {
      return response.internalServerError({ message: e.message, serve: null })
    }
  }

  /**
   * Create Concern
   */
  public async store({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createConcernValidator)

      const concern = await Concern.create({
        ...payload,
        slug: await generateSlug(payload.name),
      })

      return response.created({ message: 'Success', serve: concern })
    } catch (e) {
      return response.internalServerError({ message: e.message, serve: null })
    }
  }

  /**
   * Show Concern detail by slug
   */
  public async show({ params, response }: HttpContext) {
    try {
      const concern = await Concern.query()
        .where('slug', params.slug)
        .apply((scopes) => scopes.active())
        .preload('options', (query) => {
          query.apply((scopes) => scopes.active()).orderBy('position', 'asc')
        })
        .first()

      if (!concern) {
        return response.notFound({ message: 'Concern not found', serve: null })
      }

      return response.ok({ message: 'Success', serve: concern })
    } catch (e) {
      return response.internalServerError({ message: e.message, serve: null })
    }
  }

  /**
   * Update Concern by slug
   */
  public async update({ params, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateConcernValidator)

      const concern = await Concern.query()
        .where('slug', params.slug)
        .apply((scopes) => scopes.active())
        .first()

      if (!concern) {
        return response.notFound({ message: 'Concern not found', serve: null })
      }

      concern.merge({
        name: payload.name ?? concern.name,
        slug: payload.name ? await generateSlug(payload.name) : concern.slug,
        description: payload.description ?? concern.description,
      })
      await concern.save()

      return response.ok({ message: 'Success', serve: concern })
    } catch (e) {
      return response.internalServerError({ message: e.message, serve: null })
    }
  }

  /**
   * Soft Delete Concern
   */
  public async delete({ params, response }: HttpContext) {
    try {
      const concern = await Concern.query().where('slug', params.slug).first()
      if (!concern) {
        return response.notFound({ message: 'Concern not found', serve: null })
      }

      await concern.softDelete()
      return response.ok({ message: 'Deleted (soft)', serve: true })
    } catch (e) {
      return response.internalServerError({ message: e.message, serve: null })
    }
  }

  /**
   * Restore Concern
   */
  public async restore({ params, response }: HttpContext) {
    try {
      const concern = await Concern.query()
        .where('slug', params.slug)
        .apply((scopes) => scopes.trashed())
        .first()

      if (!concern) {
        return response.notFound({ message: 'Concern not found or already active', serve: null })
      }

      await concern.restore()
      return response.ok({ message: 'Restored', serve: concern })
    } catch (e) {
      return response.internalServerError({ message: e.message, serve: null })
    }
  }
}
