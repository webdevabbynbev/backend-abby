import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Concern from '#models/concern'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    await Concern.createMany([
      {
        name: 'Antiaging',
        slug: 'antiaging',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Brightening',
        slug: 'brightening',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Dry Skin',
        slug: 'dry-skin',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
      {
        name: 'Acne Skin',
        slug: 'acne-skin',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      },
    ])
  }
}
