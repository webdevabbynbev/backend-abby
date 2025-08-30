import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'
import { storeTagValidator, updateTagValidator } from '#validators/tag'
import emitter from '@adonisjs/core/services/emitter'
import { generateSlug } from '../../utils/helpers.js'

export default class TagsController {
  /**
   * List with pagination & search
   */
  public async index({ response, request }: HttpContext) {
    const queryString = request.qs()
    const search: string = queryString?.q
    const page: number = Number.isNaN(Number.parseInt(queryString.page)) ? 1 : Number.parseInt(queryString.page)
    const perPage: number = Number.isNaN(Number.parseInt(queryString.per_page)) ? 10 : Number.parseInt(queryString.per_page)

    const tags = await Tag.query()
      .if(search, (query) => {
        query.whereILike('name', `%${search}%`)
      })
      .paginate(page, perPage)

    return response.ok({
      message: 'Success',
      serve: {
        data: tags.toJSON().data,
        ...tags.toJSON().meta,
      },
    })
  }

  /**
   * Create tag
   */
  public async store({ response, request, auth }: HttpContext) {
    const payload = await request.validateUsing(storeTagValidator)

    const tag = await Tag.create({
      ...payload,
      slug: await generateSlug(payload.name),
    })

    // @ts-ignore
    await emitter.emit('set:activity-log', {
      roleName: auth.user?.role_name,
      userName: auth.user?.name,
      activity: `Create Tag ${tag.name}`,
      menu: 'Tag',
      data: tag.toJSON(),
    })

    return response.created({
      message: 'Success',
      serve: tag,
    })
  }

  /**
   * Update tag by slug
   */
  public async update({ response, params, request, auth }: HttpContext) {
    const { slug } = params
    const payload = await request.validateUsing(updateTagValidator)

    const tag = await Tag.query().where('slug', slug).first()
    if (!tag) return response.notFound({ message: 'Tag not found', serve: null })

    const oldData = tag.toJSON()

    tag.merge({
      name: payload.name ?? tag.name,
      slug: payload.name ? await generateSlug(payload.name) : tag.slug,
      description: payload.description ?? tag.description,
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

    return response.ok({
      message: 'Success',
      serve: tag,
    })
  }

  /**
   * Show tag by slug
   */
  public async show({ response, params }: HttpContext) {
    const { slug } = params
    const tag = await Tag.query().where('slug', slug).first()

    if (!tag) return response.notFound({ message: 'Tag not found', serve: null })

    return response.ok({
      message: 'Success',
      serve: tag,
    })
  }

  /**
   * Delete tag by slug (hard delete)
   */
  public async delete({ response, params, auth }: HttpContext) {
    const { slug } = params
    const tag = await Tag.query().where('slug', slug).first()

    if (!tag) return response.notFound({ message: 'Tag not found', serve: null })

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

    return response.ok({
      message: 'Success',
      serve: true,
    })
  }
}
