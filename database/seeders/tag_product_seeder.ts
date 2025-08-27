import { BaseSeeder } from '@adonisjs/lucid/seeders'
import TagProducts from '#models/tag_product'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    await TagProducts.createMany([
      {
        name: 'Abby',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Bev',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
    ])
  }
}
