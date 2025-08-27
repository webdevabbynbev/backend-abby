import type { HttpContext } from '@adonisjs/core/http'
import { generateSlug } from '../../utils/helpers.js'
import CategoryType from '#models/category_type'
import { createCategoryType } from '#validators/category_types'
import emitter from '@adonisjs/core/services/emitter'

export default class CategoryTypesController {
  /**
   * List with pagination & search
   */
  public async index({ response, request }: HttpContext) {
    try {
      const queryString = request.qs()
      const search: string = queryString?.q
      const page: number = Number.isNaN(Number.parseInt(queryString.page))
        ? 1
        : Number.parseInt(queryString.page)
      const perPage: number = Number.isNaN(Number.parseInt(queryString.per_page))
        ? 10
        : Number.parseInt(queryString.per_page)

      const categories = await CategoryType.query()
      .apply((query) => query.active())
      .if(search, (query) => {
        query.where((q) => {
          q.whereILike('name', `%${search}%`)
        })
      })
      .preload('children', (q) => {
        q.apply((query) => query.active()) // 🔑 filter anak yang aktif
      })
      .paginate(page, perPage)

      return response.status(200).send({
        message: 'Success',
        serve: {
          data: categories.toJSON().data,
          ...categories.toJSON().meta,
        },
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * List without pagination (Tree)
   */
  public async list({ response }: HttpContext) {
    try {
      const categories = await CategoryType.query()
      .apply((query) => query.active())
      .whereNull('parent_id')
      .preload('children', (q) => {
        q.apply((query) => query.active()) // 🔑 filter children aktif saja
        .preload('children', (qq) => {
          qq.apply((query) => query.active()) // recursive filter juga
        })
      })


      return response.status(200).send({
        message: 'Success',
        serve: categories,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Create category
   */
  public async store({ response, request, auth }: HttpContext) {
    try {
      const payload = await createCategoryType.validate(request.all())

      const category: CategoryType = await CategoryType.create({
        ...payload,
        slug: await generateSlug(payload.name),
        parentId: payload.parentId ?? null,
        level: payload.level ?? (payload.parentId ? 2 : 1),
        createdBy: auth.user?.id,
        updatedBy: auth.user?.id,
      })

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Category ${category.name}`,
        menu: 'Category',
        data: category.toJSON(),
      })

      return response.status(201).send({
        message: 'Success',
        serve: category,
      })
    } catch (e) {
      if (e.status === 422) {
        return response.status(422).send({
          message:
            e.messages?.length > 0
              ? e.messages.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: e.messages,
        })
      }

      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Update category
   */
  public async update({ response, params, request, auth }: HttpContext) {
    try {
      const { slug } = params
      const payload = await createCategoryType.validate(request.all())

      const category: CategoryType | null = await CategoryType.query()
        .apply((query) => query.active())
        .where('slug', slug)
        .first()

      if (!category) {
        return response.status(404).send({
          message: 'Category not found',
          serve: null,
        })
      }

      const oldData = category.toJSON()

      category.merge({
        name: payload.name,
        slug: await generateSlug(payload.name),
        parentId: payload.parentId ?? null,
        level: payload.level ?? (payload.parentId ? 2 : 1),
        updatedBy: auth.user?.id,
      })

      await category.save()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Category ${oldData.name}`,
        menu: 'Category',
        data: { old: oldData, new: category.toJSON() },
      })

      return response.status(200).send({
        message: 'Success',
        serve: category,
      })
    } catch (e) {
      if (e.status === 422) {
        return response.status(422).send({
          message:
            e.messages?.length > 0
              ? e.messages.map((v: { message: string }) => v.message).join(',')
              : 'Validation error.',
          serve: e.messages,
        })
      }

      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Show detail by slug
   */
  public async show({ response, params }: HttpContext) {
    try {
      const { slug } = params
      const category = await CategoryType.query()
      .apply((query) => query.active()) // ✅ filter whereNull('deleted_at')
      .where('slug', slug)
      .first()

      if (!category) {
        return response.status(404).send({
          message: 'Category not found',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'Success',
        serve: category,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  /**
   * Soft delete category
   */
  public async delete({ response, params, auth }: HttpContext) {
    try {
      const { slug } = params

      const category: CategoryType | null = await CategoryType.query()
        .where('slug', slug)
        .first()

      if (!category) {
        return response.status(404).send({
          message: 'Category not found',
          serve: null,
        })
      }

      const oldData = category.toJSON()

      // 🚨 permanent delete
      await category.delete()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Permanently Delete Category ${oldData.name}`,
        menu: 'Category',
        data: oldData,
      })

      return response.status(200).send({
        message: 'Success',
        serve: true,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }
}
