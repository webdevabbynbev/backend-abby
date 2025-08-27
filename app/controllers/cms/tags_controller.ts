import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'
import { storeTagValidator, updateTagValidator } from '#validators/tag'
import emitter from '@adonisjs/core/services/emitter'

export default class TagsController {
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

      const tags = await Tag.query()
        .if(search, (query) => {
          query.whereILike('name', `%${search}%`)
        })
        
        .paginate(page, perPage)

      return response.status(200).send({
        message: 'Success',
        serve: {
          data: tags.toJSON().data,
          ...tags.toJSON().meta,
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
   * Create tag
   */
  public async store({ response, request, auth }: HttpContext) {
    try {
      const payload = await request.validateUsing(storeTagValidator)

      const tag = await Tag.create({
        ...payload,
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
              ? e.messages.map((v: { message: string }) => v.message).join(', ')
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
   * Update tag
   */
  public async update({ response, params, request, auth }: HttpContext) {
    try {
      const { id } = params
      const payload = await request.validateUsing(updateTagValidator)

      const tag = await Tag.find(id)
      if (!tag) {
        return response.status(404).send({
          message: 'Tag not found',
          serve: null,
        })
      }

      const oldData = tag.toJSON()

      tag.merge(payload)
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
              ? e.messages.map((v: { message: string }) => v.message).join(', ')
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
   * Show detail by ID
   */
  public async show({ response, params }: HttpContext) {
    try {
      const { id } = params
      const tag = await Tag.find(id)

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

  /**
   * Delete tag (hard delete)
   */
  public async delete({ response, params, auth }: HttpContext) {
    try {
      const { id } = params

      const tag = await Tag.find(id)
      if (!tag) {
        return response.status(404).send({
          message: 'Tag not found',
          serve: null,
        })
      }

      const oldData = tag.toJSON()
      await tag.delete()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Delete Tag ${oldData.name}`,
        menu: 'Tag',
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