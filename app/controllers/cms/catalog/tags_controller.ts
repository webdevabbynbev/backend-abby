import type { HttpContext } from '@adonisjs/core/http'
import Tag from '#models/tag'
import { storeTagValidator, updateTagValidator } from '#validators/tag'
import emitter from '@adonisjs/core/services/emitter'
import Helpers from '#utils/helpers'

type AnyError = any

export default class TagsController {
  private parseIntOr(value: any, fallback: number) {
    const n = Number.parseInt(String(value ?? ''), 10)
    return Number.isNaN(n) ? fallback : n
  }

  private isValidationError(e: AnyError) {
    return e?.code === 'E_VALIDATION_ERROR' || e?.status === 422
  }

  private isUniqueError(e: AnyError) {
    // Postgres: 23505, MySQL: ER_DUP_ENTRY, SQLite: SQLITE_CONSTRAINT
    const code = e?.code
    const errno = e?.errno
    const message = String(e?.message ?? '').toLowerCase()
    return (
      code === '23505' ||
      code === 'ER_DUP_ENTRY' ||
      code === 'SQLITE_CONSTRAINT' ||
      errno === 1062 ||
      message.includes('duplicate') ||
      message.includes('unique')
    )
  }

  private respondError({ response }: HttpContext, e: AnyError) {
    if (this.isValidationError(e)) {
      return response.status(422).send({
        message: e.message || 'Validation error',
        errors: e.messages || e?.messages,
        serve: null,
      })
    }

    if (this.isUniqueError(e)) {
      return response.status(409).send({
        message: e.message || 'Duplicate / unique constraint error',
        serve: null,
      })
    }

    return response.status(500).send({
      message: e.message || 'Internal Server Error',
      serve: null,
    })
  }

  /**
   * Buat slug unik (auto suffix -2, -3, dst) untuk menghindari tabrakan UNIQUE(slug).
   * ignoreId dipakai saat update biar tidak nabrak dirinya sendiri.
   */
  private async makeUniqueSlug(name: string, ignoreId?: number | string) {
    const base = await Helpers.generateSlug(name)
    let candidate = base
    let i = 2

    // cek ke semua record (tidak filter deleted_at) karena unique index DB biasanya berlaku ke seluruh row
    while (true) {
      const q = Tag.query().where('slug', candidate)
      if (ignoreId) q.whereNot('id', ignoreId as any)

      const exists = await q.first()
      if (!exists) return candidate

      candidate = `${base}-${i}`
      i++
    }
  }

  public async get(ctx: HttpContext) {
    const { response, request } = ctx
    try {
      const qs = request.qs()
      const search = String(qs?.q ?? qs?.name ?? '').trim()
      const page = this.parseIntOr(qs.page, 1)
      const perPage = this.parseIntOr(qs.per_page, 10)

      const tags = await Tag.query()
        // kalau model punya soft delete pakai deleted_at
        .whereNull('deleted_at')
        .if(search.length > 0, (query) => {
          query.whereILike('name', `%${search}%`)
        })
        .orderBy('name', 'asc')
        .paginate(page, perPage)

      return response.ok({
        message: 'Success',
        serve: {
          data: tags.toJSON().data,
          ...tags.toJSON().meta,
        },
      })
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }

  public async create(ctx: HttpContext) {
    const { response, request, auth } = ctx
    try {
      const payload = await request.validateUsing(storeTagValidator)

      // optional: cek name duplikat (hindari 500/409 dari DB)
      const existingByName = await Tag.query().where('name', payload.name).first()
      if (existingByName) {
        return response.status(409).send({
          message: 'Tag name already exists',
          serve: null,
        })
      }

      const slug = await this.makeUniqueSlug(payload.name)

      const tag = await Tag.create({
        ...payload,
        slug,
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
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }

  public async update(ctx: HttpContext) {
    const { response, params, request, auth } = ctx
    try {
      const { slug } = params

      const tag = await Tag.query().where('slug', slug).whereNull('deleted_at').first()
      if (!tag) return response.notFound({ message: 'Tag not found', serve: null })

      const payload = await request.validateUsing(updateTagValidator)
      const oldData = tag.toJSON()

      let nextName = tag.name
      let nextSlug = tag.slug

      if (payload.name && payload.name !== tag.name) {
        const existingByName = await Tag.query()
          .where('name', payload.name)
          .whereNot('id', tag.id as any)
          .first()

        if (existingByName) {
          return response.status(409).send({
            message: 'Tag name already exists',
            serve: null,
          })
        }

        nextName = payload.name
        nextSlug = await this.makeUniqueSlug(payload.name, tag.id)
      }

      tag.merge({
        name: nextName,
        slug: nextSlug,
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
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }

  public async show(ctx: HttpContext) {
    const { response, params } = ctx
    try {
      const { slug } = params
      const tag = await Tag.query().where('slug', slug).whereNull('deleted_at').first()

      if (!tag) return response.notFound({ message: 'Tag not found', serve: null })

      return response.ok({
        message: 'Success',
        serve: tag,
      })
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }

  public async delete(ctx: HttpContext) {
    const { response, params, auth } = ctx
    try {
      const { slug } = params

      const tag = await Tag.query().where('slug', slug).whereNull('deleted_at').first()
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
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }
}
