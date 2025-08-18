import { BaseSeeder } from '@adonisjs/lucid/seeders'
import CategoryTypes from '#models/category_type'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    await CategoryTypes.createMany([
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
