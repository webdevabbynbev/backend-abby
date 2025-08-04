import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('photo_profile').nullable()
      table.date('dob').nullable()
      table.string('phone_number').nullable()
      table.tinyint('gender').nullable()
      table.text('address').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('photo_profile')
      table.dropColumn('dob')
      table.dropColumn('phone_number')
      table.dropColumn('gender')
      table.dropColumn('address')
    })
  }
}