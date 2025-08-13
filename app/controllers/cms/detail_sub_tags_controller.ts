import type { HttpContext } from '@adonisjs/core/http'
import DetailSubTag from '#models/detail_sub_tag'
import db from '@adonisjs/lucid/services/db'
import { create } from '#validators/detail_sub_tag'
import emitter from '@adonisjs/core/services/emitter'

export default class DetailSubTagsController {
  public async get({ response, request }: HttpContext) {
    try {
      const { name, page = 1, per_page = 10 } = request.qs()

      const dataDetailSubTag = await DetailSubTag.query()
        .apply((scopes) => scopes.active())
        .if(name, (query) => {
          query.where('detail_sub_tags.name', 'like', `%${name}%`)
        })
        .orderBy('detail_sub_tags.created_at', 'desc')
        .preload('subTag', (query) => {
          query.apply((scopes) => scopes.active())
        })
        .paginate(page, per_page)

      const meta = dataDetailSubTag.toJSON().meta

      return response.status(200).send({
        message: 'success',
        serve: {
          data: dataDetailSubTag.toJSON().data,
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

      const detailSubTag = new DetailSubTag()
      detailSubTag.name = request.input('name')
      detailSubTag.subTagId = request.input('sub_tag_id')

      const basePath = request
        .input('name')
        .replace(/[^a-zA-Z0-9_ -]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()

      const existsPath = await DetailSubTag.query().where('path', basePath)
      detailSubTag.path = existsPath.length > 0
        ? `${basePath}-${existsPath.length + 1}`
        : basePath

      await detailSubTag.save()

      // Activity log
      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Detail Sub Tag`,
        menu: 'Detail Sub Tag',
        data: detailSubTag.toJSON(),
      })

      await trx.commit()
      return response.status(200).send({
        message: 'Sucessfully created.',
        serve: detailSubTag,
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

      const detailSubTag = await DetailSubTag.query()
        .where('id', params.id)
        .first()

      if (!detailSubTag) {
        return response.status(400).send({
          message: 'Invalid data.',
          serve: [],
        })
      }

      const oldData = detailSubTag.toJSON()
      detailSubTag.subTagId = request.input('sub_tag_id')

      if (detailSubTag.name !== request.input('name')) {
        const basePath = request
          .input('name')
          .replace(/[^a-zA-Z0-9_ -]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase()

        const existsPath = await DetailSubTag.query().where('path', basePath)
        detailSubTag.path = existsPath.length > 0
          ? `${basePath}-${existsPath.length + 1}`
          : basePath
      }

      detailSubTag.name = request.input('name')
      await detailSubTag.save()

      // Activity log
      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Detail Sub Tag`,
        menu: 'Detail Sub Tag',
        data: { old: oldData, new: detailSubTag.toJSON() },
      })

      await trx.commit()
      return response.status(200).send({
        message: 'Sucessfully updated.',
        serve: detailSubTag,
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
      const detailSubTag = await DetailSubTag.query()
        .where('id', params.id)
        .first()

      if (detailSubTag) {
        await detailSubTag.softDelete()

        // Activity log
        // @ts-ignore
        await emitter.emit('set:activity-log', {
          roleName: auth.user?.role_name,
          userName: auth.user?.name,
          activity: `Delete Detail Sub Tag`,
          menu: 'Detail Sub Tag',
          data: detailSubTag.toJSON(),
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
