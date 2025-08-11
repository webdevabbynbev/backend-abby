import { BaseSeeder } from '@adonisjs/lucid/seeders'
import CategoryTypes from '#models/category_type'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    await CategoryTypes.createMany([
      {
        name: 'Make Up',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Skincare',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Hand Care',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Beauty Kits',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Bath & Body',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Men Care',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Perfumes',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'High End Brands',
        createdBy: 1,
        updatedBy: 1,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
    ])
  }
}
