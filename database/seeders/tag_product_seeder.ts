import { BaseSeeder } from '@adonisjs/lucid/seeders'
import TagProducts from '#models/tag_product'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    await TagProducts.createMany([
      {
        name: 'Flash Sale',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Best Sellers',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'New Arrivals',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
    ])
  }
}
