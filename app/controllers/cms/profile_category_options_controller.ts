import type { HttpContext } from '@adonisjs/core/http'
import ProfileCategoryOption from '#models/profile_category_option'
import {
  storeProfileCategoryOptionValidator,
  updateProfileCategoryOptionValidator,
} from '#validators/profile_category_option'

export default class ProfileCategoryOptionsController {
  /**
   * List Options (pagination + search + filter active/trashed/active_only)
   */
  public async index({ request, response }: HttpContext) {
    try {
      const { q, page = 1, per_page = 10, active_only, trashed_only } = request.qs()

      const options = await ProfileCategoryOption.query()
        .if(!trashed_only, (q) => q.apply((scopes) => scopes.active()))
        .if(trashed_only, (q) => q.apply((scopes) => scopes.trashed()))
        .if(active_only, (q) => q.where('is_active', true))
        .if(q, (query) => query.whereILike('label', `%${q}%`))
        .preload('category')
        .preload('products')
        .paginate(Number(page), Number(per_page))

      return response.ok({
        status: true,
        message: 'Success',
        data: options.toJSON().data,
        meta: options.toJSON().meta,
      })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Create Option
   */
  public async store({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(storeProfileCategoryOptionValidator)
      const option = await ProfileCategoryOption.create(payload)

      return response.created({ status: true, message: 'Created', data: option })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Show Option by id
   */
  public async show({ params, response }: HttpContext) {
    try {
      const option = await ProfileCategoryOption.query()
        .where('id', params.id)
        .apply((scopes) => scopes.active())
        .preload('category')
        .preload('products')
        .first()

      if (!option) return response.notFound({ status: false, message: 'Not found' })

      return response.ok({ status: true, message: 'Success', data: option })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Update Option
   */
  public async update({ params, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateProfileCategoryOptionValidator)
      const option = await ProfileCategoryOption.query()
        .where('id', params.id)
        .apply((scopes) => scopes.active())
        .first()

      if (!option) return response.notFound({ status: false, message: 'Not found' })

      option.merge(payload)
      await option.save()

      return response.ok({ status: true, message: 'Updated', data: option })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Soft Delete
   */
  public async delete({ params, response }: HttpContext) {
    try {
      const option = await ProfileCategoryOption.find(params.id)
      if (!option) return response.notFound({ status: false, message: 'Not found' })

      await option.softDelete() // pakai method dari model

      return response.ok({ status: true, message: 'Deleted (soft)', data: option })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Restore
   */
  public async restore({ params, response }: HttpContext) {
    try {
      const option = await ProfileCategoryOption.query()
        .where('id', params.id)
        .apply((scopes) => scopes.trashed())
        .first()

      if (!option) {
        return response.notFound({ status: false, message: 'Not found or already active' })
      }

      await option.restore() // pakai method dari model

      return response.ok({ status: true, message: 'Restored', data: option })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }
}
