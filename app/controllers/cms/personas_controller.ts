import type { HttpContext } from '@adonisjs/core/http'
import Persona from '#models/persona'
import { generateSlug } from '../../utils/helpers.js'
import { storePersonaValidator, updatePersonaValidator } from '#validators/persona'

export default class PersonasController {
  /**
   * List Personas (pagination + search)
   */
  public async index({ request, response }: HttpContext) {
    try {
      const queryString = request.qs()
      const search: string = queryString?.q
      const page: number = Number.isNaN(Number.parseInt(queryString.page))
        ? 1
        : Number.parseInt(queryString.page)
      const perPage: number = Number.isNaN(Number.parseInt(queryString.per_page))
        ? 10
        : Number.parseInt(queryString.per_page)

      const personas = await Persona.query()
        .whereNull('deleted_at')
        .if(search, (query) => {
          query.whereILike('name', `%${search}%`)
        })
        .paginate(page, perPage)

      return response.ok({
        message: 'Success',
        serve: {
          data: personas.toJSON().data,
          ...personas.toJSON().meta,
        },
      })
    } catch (e) {
      return response.status(500).send({ message: e.message, serve: null })
    }
  }

  /**
   * Create Persona
   */
  public async store({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(storePersonaValidator)

      const persona = await Persona.create({
        ...payload,
        slug: await generateSlug(payload.name),
      })

      return response.created({
        message: 'Success',
        serve: persona,
      })
    } catch (e) {
      return response.status(500).send({ message: e.message, serve: null })
    }
  }

  /**
   * Show Persona detail by slug
   */
  public async show({ params, response }: HttpContext) {
    try {
      const { slug } = params
      const persona = await Persona.query().where('slug', slug).whereNull('deleted_at').first()

      if (!persona) {
        return response.notFound({
          message: 'Persona not found',
          serve: null,
        })
      }

      return response.ok({
        message: 'Success',
        serve: persona,
      })
    } catch (e) {
      return response.status(500).send({ message: e.message, serve: null })
    }
  }

  /**
   * Update Persona by slug
   */
  public async update({ params, request, response }: HttpContext) {
    try {
      const { slug } = params
      const payload = await request.validateUsing(updatePersonaValidator)

      const persona = await Persona.query().where('slug', slug).whereNull('deleted_at').first()

      if (!persona) {
        return response.notFound({
          message: 'Persona not found',
          serve: null,
        })
      }

      persona.merge({
        name: payload.name ?? persona.name,
        slug: payload.name ? await generateSlug(payload.name) : persona.slug,
        description: payload.description ?? persona.description,
      })

      await persona.save()

      return response.ok({
        message: 'Success',
        serve: persona,
      })
    } catch (e) {
      return response.status(500).send({ message: e.message, serve: null })
    }
  }

  /**
   * Delete Persona (soft delete)
   */
  public async delete({ params, response }: HttpContext) {
    try {
      const { slug } = params
      const persona = await Persona.query().where('slug', slug).first()

      if (!persona) {
        return response.notFound({
          message: 'Persona not found',
          serve: null,
        })
      }

      await persona.delete()

      return response.ok({
        message: 'Success',
        serve: true,
      })
    } catch (e) {
      return response.status(500).send({ message: e.message, serve: null })
    }
  }
}
