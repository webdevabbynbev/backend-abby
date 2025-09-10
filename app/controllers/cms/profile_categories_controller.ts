import type { HttpContext } from '@adonisjs/core/http'
import ProfileCategory from '#models/profile_category'
import {
  storeProfileCategoryValidator,
  updateProfileCategoryValidator,
} from '#validators/profile_category'

export default class ProfileCategoriesController {
  /**
   * List Profile Categories (pagination + search + filter active/trashed)
   */
  public async index({ request, response }: HttpContext) {
    try {
      const { q, page = 1, per_page = 10, trashed_only } = request.qs()

      const categories = await ProfileCategory.query()
        .if(!trashed_only, (q) => q.apply((scopes) => scopes.active()))
        .if(trashed_only, (q) => q.apply((scopes) => scopes.trashed()))
        .if(q, (query) => query.whereILike('name', `%${q}%`))
        .preload('options', (q) => q.apply((scopes) => scopes.active()).preload('products'))
        .paginate(Number(page), Number(per_page))

      return response.ok({
        status: true,
        message: 'Success',
        data: categories.toJSON().data,
        meta: categories.toJSON().meta,
      })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Create Profile Category
   */
  public async store({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(storeProfileCategoryValidator)
      const category = await ProfileCategory.create(payload)

      return response.created({ status: true, message: 'Created', data: category })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Show Profile Category by id
   */
  public async show({ params, response }: HttpContext) {
    try {
      const category = await ProfileCategory.query()
        .where('id', params.id)
        .apply((scopes) => scopes.active())
        .preload('options', (q) => q.apply((scopes) => scopes.active()).preload('products'))
        .first()

      if (!category) {
        return response.notFound({ status: false, message: 'Not found' })
      }

      return response.ok({ status: true, message: 'Success', data: category })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Update Profile Category
   */
  public async update({ params, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateProfileCategoryValidator)
      const category = await ProfileCategory.query()
        .where('id', params.id)
        .apply((scope) => scope.active())
        .first()

      if (!category) return response.notFound({ status: false, message: 'Not found' })

      category.merge(payload)
      await category.save()

      return response.ok({ status: true, message: 'Updated', data: category })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Soft Delete
   */
  public async delete({ params, response }: HttpContext) {
    try {
      const category = await ProfileCategory.find(params.id)
      if (!category) return response.notFound({ status: false, message: 'Not found' })

      await category.softDelete()

      return response.ok({ status: true, message: 'Deleted (soft)', data: category })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }

  /**
   * Restore
   */
  public async restore({ params, response }: HttpContext) {
    try {
      const category = await ProfileCategory.query()
        .where('id', params.id)
        .apply((scopes) => scopes.trashed()) // ✅ panggil scope trashed dengan callback
        .first()

      if (!category) {
        return response.notFound({ status: false, message: 'Not found or already active' })
      }

      await category.restore()

      return response.ok({ status: true, message: 'Restored', data: category })
    } catch (e) {
      return response.internalServerError({ status: false, message: e.message })
    }
  }
}
