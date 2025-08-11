import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cities'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('province', 30).nullable()
      table.string('type', 30).nullable()
      table.string('name', 100).nullable()
      table.string('postal_code', 30).nullable()
      table
        .integer('province_id')
        .unsigned()
        .nullable()
        .references('provinces.id')
        .onDelete('cascade')
        .onUpdate('cascade')
      table.timestamp('created_at').defaultTo(this.now()).notNullable()
      table.timestamp('updated_at').defaultTo(this.now()).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
