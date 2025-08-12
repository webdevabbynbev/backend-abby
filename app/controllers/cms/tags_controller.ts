import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { create } from '#validators/tag'
import Tag from '#models/tag'
import emitter from '@adonisjs/core/services/emitter'

export default class TagsController {
  public async get({ response, request }: HttpContext) {
    try {
      const { name, page = 1, per_page = 10 } = request.qs()

      const dataTag = await Tag.query()
        .apply((scopes) => scopes.active())
        .if(name, (query) => {
          query.where('tags.name', 'like', `%${name}%`)
        })
        .preload('subTags', (query) => {
          query.apply((scopes) => scopes.active())
               .preload('detailSubTags', (detailQuery) => {
                 detailQuery.apply((scopes) => scopes.active())
               })
        })
        .orderBy('tags.created_at', 'desc')
        .paginate(page, per_page)

      const meta = dataTag.toJSON().meta

      return response.status(200).send({
        message: 'success',
        serve: {
          data: dataTag.toJSON().data,
          ...meta,
        },
      })
    } catch (error) {
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async list({ response }: HttpContext) {
    try {
      const dataTag = await Tag.query()
        .apply((scopes) => scopes.active())
        .preload('subTags', (query) => {
          query
            .apply((scopes) => scopes.active())
            .preload('detailSubTags', (detailQuery) => {
              detailQuery.apply((scopes) => scopes.active())
            })
        })
        .orderBy('tags.name', 'asc')

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

  public async create({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const data = request.all()
      await create.validate(data)

      const dataTag = new Tag()
      dataTag.name = request.input('name')

      const basePath = request.input('name')
        .replace(/[^a-zA-Z0-9_ -]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()

      const existsPath = await Tag.query().where('path', basePath)
      dataTag.path = existsPath.length > 0
        ? `${basePath}-${existsPath.length + 1}`
        : basePath

      await dataTag.save()

      // Log aktivitas
      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Tag`,
        menu: 'Tag Product',
        data: dataTag.toJSON(),
      })

      await trx.commit()
      return response.status(200).send({
        message: 'Sucessfully created.',
        serve: dataTag,
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async update({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const data = request.all()
      await create.validate(data)

      const dataTag = await Tag.query().where('id', request.input('id')).first()
      if (!dataTag) {
        return response.status(400).send({
          message: 'Invalid data.',
          serve: [],
        })
      }

      const oldData = dataTag.toJSON()

      if (dataTag.name !== request.input('name')) {
        const basePath = request.input('name')
          .replace(/[^a-zA-Z0-9_ -]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()

        const existsPath = await Tag.query().where('path', basePath)
        dataTag.path = existsPath.length > 0
          ? `${basePath}-${existsPath.length + 1}`
          : basePath
      }

      dataTag.name = request.input('name')
      await dataTag.save()

      // Log aktivitas
      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Tag Product`,
        menu: 'Tag Product',
        data: { old: oldData, new: dataTag.toJSON() },
      })

      await trx.commit()
      return response.status(200).send({
        message: 'Sucessfully updated.',
        serve: dataTag,
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async delete({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const tag = await Tag.query().where('id', request.input('id')).first()
      if (tag) {
        await tag.softDelete()

        // Log aktivitas
        // @ts-ignore
        await emitter.emit('set:activity-log', {
          roleName: auth.user?.role_name,
          userName: auth.user?.name,
          activity: `Delete Tag Product`,
          menu: 'Tag Product',
          data: tag.toJSON(),
        })

        await trx.commit()
        return response.status(200).send({
          message: 'Successfully deleted.',
          serve: [],
        })
      } else {
        await trx.commit()
        return response.status(422).send({
          message: 'Invalid data.',
          serve: [],
        })
      }
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }
}
