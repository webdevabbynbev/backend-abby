import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_addresses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.string('address_title').notNullable()
      table.string('first_name').notNullable()
      table.string('last_name').nullable()
      table.string('phone_number').notNullable()
      table.string('full_address').notNullable()
      table.string('benchmark').nullable()
      table.string('city_id').unsigned().references('id').inTable('cities')
      table.string('postal_code').notNullable()
      table.boolean('is_default').defaultTo(false)
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}