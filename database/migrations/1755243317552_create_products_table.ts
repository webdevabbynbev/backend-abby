import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name').notNullable()
      table.text('description').nullable()
      table.integer('weight').defaultTo(0)
      table.string('base_price').nullable()
      table.tinyint('is_flashsale').defaultTo(0)
      table
        .integer('category_type_id')
        .unsigned()
        .nullable()
        .references('category_types.id')
        .onDelete('cascade')
        .onUpdate('cascade')
      table.string('popularity').nullable()
      table.text('path').nullable()
      table.tinyint('position').nullable()
      table.text('meta_title').nullable()
      table.text('meta_description').nullable()
      table.text('meta_keywords').nullable()
      table.timestamp('deleted_at').nullable().defaultTo(null)
      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}