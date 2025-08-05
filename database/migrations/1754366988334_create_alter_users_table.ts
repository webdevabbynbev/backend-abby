import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('created_by').unsigned()
      table.integer('updated_by').unsigned()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('created_by').unsigned()
      table.integer('updated_by').unsigned()
    })
  }
}