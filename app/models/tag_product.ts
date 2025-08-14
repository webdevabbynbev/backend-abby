import { DateTime } from 'luxon'
import { beforeUpdate, beforeCreate, column} from '@adonisjs/lucid/orm'
import { generateSlug } from '../utils/helpers.js'
import { CustomBaseModel } from '#services/custom_base_model'

export default class TagProducts extends CustomBaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare slug: string

  @column()
  declare createdBy: number

  @column()
  declare updatedBy: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime({ serializeAs: null })
  declare deletedAt: DateTime

  @beforeUpdate()
  @beforeCreate()
  public static async setSlug(tag: TagProducts) {
    if (!tag.$dirty.name) {
      return
    }
    let baseSlug: string = await generateSlug(tag.name)
    let slug: string = baseSlug
    let counter: number = 1

    let existingSlug: TagProducts | null = await TagProducts.query().where('slug', slug).first()

    while (existingSlug) {
      slug = `${baseSlug}-${counter}`
      existingSlug = await TagProducts.query().where('slug', slug).first()
      counter++
    }

    tag.slug = slug
  }
}