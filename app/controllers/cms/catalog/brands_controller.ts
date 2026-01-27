import type { HttpContext } from '@adonisjs/core/http'
import Helpers from '#utils/helpers'
import Brand from '#models/brand'
import { createBrandValidator, updateBrandValidator } from '#validators/brand'
import emitter from '@adonisjs/core/services/emitter'

type AnyError = any

export default class BrandsController {
  private parseIntOr(value: any, fallback: number) {
    const n = Number.parseInt(String(value ?? ''), 10)
    return Number.isNaN(n) ? fallback : n
  }

  /**
   * Normalize isActive dari number/string/boolean jadi boolean.
   * - true/false -> 그대로
   * - 1/0 -> true/false
   * - "1"/"0" -> true/false
   * - "true"/"false" -> true/false
   * - undefined/null -> fallback
   */
  private normalizeIsActive(value: unknown, fallback?: boolean): boolean | undefined {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value === 1
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase()
      if (v === '1' || v === 'true' || v === 'yes') return true
      if (v === '0' || v === 'false' || v === 'no') return false
    }
    return fallback
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
   * Buat slug yang unik (auto suffix) untuk menghindari error unique constraint.
   * ignoreId dipakai saat update biar tidak nabrak dirinya sendiri.
   */
  private async makeUniqueSlug(name: string, ignoreId?: number | string) {
    const base = await Helpers.generateSlug(name)
    let candidate = base
    let i = 2

    // cek ke semua record (tidak filter deleted_at) karena unique index DB biasanya berlaku ke seluruh row
    while (true) {
      const q = Brand.query().where('slug', candidate)
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
      const queryString = request.qs()
      const search = String(queryString?.q ?? '').trim()
      const page = this.parseIntOr(queryString.page, 1)
      const perPage = this.parseIntOr(queryString.per_page, 10)

      const brands = await Brand.query()
        .whereNull('deleted_at')
        .if(search.length > 0, (query) => {
          query.whereILike('name', `%${search}%`)
        })
        .orderBy('name', 'asc')
        .paginate(page, perPage)

      return response.status(200).send({
        message: 'Success',
        serve: {
          data: brands.toJSON().data,
          ...brands.toJSON().meta,
        },
      })
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }

  public async listByLetter(ctx: HttpContext) {
    const { response } = ctx
    try {
      const brands = await Brand.query().whereNull('deleted_at').orderBy('name', 'asc')

      const grouped = brands.reduce((acc: Record<string, any[]>, brand) => {
        const letter = brand.name.charAt(0).toUpperCase()
        if (!acc[letter]) acc[letter] = []
        acc[letter].push(brand)
        return acc
      }, {})

      const result = Object.keys(grouped)
        .sort()
        .map((letter) => ({
          letter,
          children: grouped[letter],
        }))

      return response.status(200).send({
        message: 'Success',
        serve: result,
      })
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }

  public async create(ctx: HttpContext) {
    const { response, request, auth } = ctx
    try {
      const payload: any = await request.validateUsing(createBrandValidator)

      // optional: cek name duplikat (hindari 500/409 dari DB)
      const existingByName = await Brand.query().where('name', payload.name).first()
      if (existingByName) {
        return response.status(409).send({
          message: 'Brand name already exists',
          serve: null,
        })
      }

      const slug = await this.makeUniqueSlug(payload.name)

      const brand = await Brand.create({
        name: payload.name,
        slug,
        description: payload.description ?? undefined,
        logoUrl: payload.logoUrl ?? undefined,
        bannerUrl: payload.bannerUrl ?? undefined,
        country: payload.country ?? undefined,
        website: payload.website ?? undefined,
        // ✅ normalize ke boolean
        isActive: this.normalizeIsActive(payload.isActive, true) ?? true,
      } as any)

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Create Brand ${brand.name}`,
        menu: 'Brand',
        data: brand.toJSON(),
      })

      return response.status(201).send({
        message: 'Success',
        serve: brand,
      })
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }

  public async update(ctx: HttpContext) {
    const { response, params, request, auth } = ctx
    try {
      const { slug } = params

      const brand = await Brand.query().where('slug', slug).whereNull('deleted_at').first()
      if (!brand) {
        return response.status(404).send({
          message: 'Brand not found',
          serve: null,
        })
      }

      const payload: any = await request.validateUsing(updateBrandValidator)
      const oldData = brand.toJSON()

      // kalau name berubah, cek name duplikat + buat slug unik
      let nextName = brand.name
      let nextSlug = brand.slug

      if (payload.name && payload.name !== brand.name) {
        const existingByName = await Brand.query()
          .where('name', payload.name)
          .whereNot('id', brand.id as any)
          .first()

        if (existingByName) {
          return response.status(409).send({
            message: 'Brand name already exists',
            serve: null,
          })
        }

        nextName = payload.name
        nextSlug = await this.makeUniqueSlug(payload.name, brand.id as any)
      }

      brand.merge({
        name: nextName,
        slug: nextSlug,
        description: payload.description ?? brand.description,
        logoUrl: payload.logoUrl ?? brand.logoUrl,
        bannerUrl: payload.bannerUrl ?? brand.bannerUrl,
        country: payload.country ?? brand.country,
        website: payload.website ?? brand.website,
        // ✅ normalize ke boolean (fallback pakai nilai lama)
        isActive: this.normalizeIsActive(payload.isActive, brand.isActive) ?? brand.isActive,
      } as any)

      await brand.save()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Update Brand ${oldData.name}`,
        menu: 'Brand',
        data: { old: oldData, new: brand.toJSON() },
      })

      return response.status(200).send({
        message: 'Success',
        serve: brand,
      })
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }

  public async show(ctx: HttpContext) {
    const { response, params } = ctx
    try {
      const { slug } = params
      const brand = await Brand.query().where('slug', slug).whereNull('deleted_at').first()

      if (!brand) {
        return response.status(404).send({
          message: 'Brand not found',
          serve: null,
        })
      }

      return response.status(200).send({
        message: 'Success',
        serve: brand,
      })
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }

  public async delete(ctx: HttpContext) {
    const { response, params, auth } = ctx
    try {
      const { slug } = params

      const brand = await Brand.query().where('slug', slug).whereNull('deleted_at').first()
      if (!brand) {
        return response.status(404).send({
          message: 'Brand not found',
          serve: null,
        })
      }

      const oldData = brand.toJSON()
      await brand.delete()

      // @ts-ignore
      await emitter.emit('set:activity-log', {
        roleName: auth.user?.role_name,
        userName: auth.user?.name,
        activity: `Delete Brand ${oldData.name}`,
        menu: 'Brand',
        data: oldData,
      })

      return response.status(200).send({
        message: 'Success',
        serve: true,
      })
    } catch (e) {
      return this.respondError(ctx, e)
    }
  }
}
