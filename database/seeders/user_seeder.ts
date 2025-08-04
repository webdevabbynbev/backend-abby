import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '#models/user'

export default class extends BaseSeeder {
  async run () {
    await User.createMany([
      {
        firstName: 'Abby',
        lastName: 'n Bev',
        email: '@abby-n-bev.com',
        phoneNumber: '0823233323232',
        password: 'secret123',
        role: 1,
        isActive: 1,
      }
    ])
  }
}
