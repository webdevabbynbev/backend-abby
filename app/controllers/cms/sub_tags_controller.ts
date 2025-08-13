import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import SubTag from '#models/sub_tag'
import { create } from '#validators/sub_tag'
import emitter from '@adonisjs/core/services/emitter'

export default class SubTagsController {
  public async get({ response, request }: HttpContext) {
    try {
      const { name, page = 1, per_page = 10 } = request.qs()

      const dataSubTag = await SubTag.query()
        .apply((scopes) => scopes.active())
        .if(name, (query) => {
          query.where('sub_tags.name', 'like', `%${name}%`)
        })
        .orderBy('sub_tags.created_at', 'desc')
        .preload('detailSubTags', (query) => {
          query.apply((scopes) => scopes.active())
        })
        .paginate(page, per_page)

      const meta = dataSubTag.toJSON().meta

      return response.status(200).send({
        message: 'success',
        serve: {
          data: dataSubTag.toJSON().data,
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

  public async create({ response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const data = request.all()

      await create.validate(data)

      const dataSubTag = new SubTag()
      dataSubTag.name = request.input('name')
      dataSubTag.tagId = request.input('tag_id')

      const basePath = request
        .input('name')
        .replace(/[^a-zA-Z0-9_ -]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()

      const existsPath = await SubTag.query().where('path', basePath)
      dataSubTag.path = existsPath.length > 0
        ? `${basePath}-${existsPath.length + 1}`
        : basePath

      await dataSubTag.save()

      // Activity log
      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Sub Tag`,
        menu: 'Sub Tag Product',
        data: dataSubTag.toJSON(),
      })

      await trx.commit()
      return response.status(200).send({
        message: 'Sucessfully created.',
        serve: dataSubTag,
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async update({ params, response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const data = request.all()

      await create.validate(data)

      const dataSubTag = await SubTag.query().where('id', params.id).first()
      if (!dataSubTag) {
        return response.status(400).send({
          message: 'Invalid data.',
          serve: [],
        })
      }

      const oldData = dataSubTag.toJSON()

      dataSubTag.tagId = request.input('tag_id')

      if (dataSubTag.name !== request.input('name')) {
        const basePath = request
          .input('name')
          .replace(/[^a-zA-Z0-9_ -]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()

        const existsPath = await SubTag.query().where('path', basePath)
        dataSubTag.path = existsPath.length > 0
          ? `${basePath}-${existsPath.length + 1}`
          : basePath
      }

      dataSubTag.name = request.input('name')
      await dataSubTag.save()

      // Activity log
      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Sub Tag`,
        menu: 'Sub Tag Product',
        data: { old: oldData, new: dataSubTag.toJSON() },
      })

      await trx.commit()
      return response.status(200).send({
        message: 'Sucessfully updated.',
        serve: dataSubTag,
      })
    } catch (error) {
      await trx.rollback()
      return response.status(500).send({
        message: error.message || 'Internal Server Error.',
        serve: [],
      })
    }
  }

  public async delete({ params, response, request, auth }: HttpContext) {
    const trx = await db.transaction()
    try {
      const subTag = await SubTag.query().where('id', params.id).first()
      if (subTag) {
        await subTag.softDelete()

        // Activity log
        // @ts-ignore
        await emitter.emit('set:activity-log', {
          roleName: auth.user?.role_name,
          userName: auth.user?.name,
          activity: `Delete Sub Tag`,
          menu: 'Sub Tag Product',
          data: subTag.toJSON(),
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
