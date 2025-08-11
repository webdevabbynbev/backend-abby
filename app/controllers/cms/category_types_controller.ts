import type { HttpContext } from '@adonisjs/core/http'
import { generateSlug } from '../../utils/helpers.js'
import CategoryType from '#models/category_type'
import { createCategoryType } from '#validators/category_types'
import emitter from '@adonisjs/core/services/emitter'

export default class CategoryTypesController {
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
      const tags = await CategoryType.query()
        .apply((query) => query.active())
        .if(search, (query) => {
          query.where((q) => {
            q.whereILike('name', `%${search}%`)
          })
        })
        .paginate(page, perPage)
      return response.status(200).send({
        message: 'Success',
        serve: {
          data: tags?.toJSON().data,
          ...tags?.toJSON().meta,
        },
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

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

  public async store({ response, request, auth }: HttpContext) {
    try {
      const payload = await createCategoryType.validate(request.all())

      const tag: CategoryType = await CategoryType.create({
        ...payload,
        createdBy: auth.user?.id,
        updatedBy: auth.user?.id,
      })

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Tag ${tag.name}`,
        menu: 'Tag',
        data: tag.toJSON(),
      })

      return response.status(201).send({
        message: 'Success',
        serve: tag,
      })
    } catch (e) {
      if (e.status === 422) {
        return response.status(422).send({
          message:
            e.messages?.length > 0
              ? e.messages?.map((v: { message: string }) => v.message).join(',')
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

  public async update({ response, params, request, auth }: HttpContext) {
    try {
      const { slug } = params

      const payload = await createCategoryType.validate(request.all())

      const tag: CategoryType | null = await CategoryType.query()
        .apply((query) => query.active())
        .where('slug', slug)
        .first()

      if (!tag) {
        return response.status(404).send({
          message: 'Tag not found',
          serve: null,
        })
      }

      const oldData = tag.toJSON()

      tag.merge({
        name: payload.name,
        slug: await generateSlug(payload.name),
        updatedBy: auth.user?.id,
      })

      await tag.save()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Tag ${oldData.name}`,
        menu: 'Tag',
        data: { old: oldData, new: tag.toJSON() },
      })

      return response.status(200).send({
        message: 'Success',
        serve: tag,
      })
    } catch (e) {
      if (e.status === 422) {
        return response.status(422).send({
          message:
            e.messages?.length > 0
              ? e.messages?.map((v: { message: string }) => v.message).join(',')
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

  public async show({ response, params }: HttpContext) {
    try {
      const { slug } = params

      const tag: CategoryType | null = (await CategoryType.findColumnWithSoftDelete('slug', slug)) as CategoryType

      if (!tag) {
        return response.status(404).send({
          message: 'Tag not found',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'Success',
        serve: tag,
      })
    } catch (e) {
      return response.status(500).send({
        message: e.message || 'Internal Server Error',
        serve: null,
      })
    }
  }

  public async delete({ response, params, auth }: HttpContext) {
    try {
      const { slug } = params

      const tag: CategoryType | null = (await CategoryType.findColumnWithSoftDelete('slug', slug)) as CategoryType

      if (!tag) {
        return response.status(404).send({
          message: 'Tag not found',
          serve: null,
        })
      }

      await tag.softDelete()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Delete Tag ${tag.name}`,
        menu: 'Tag',
        data: tag.toJSON(),
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