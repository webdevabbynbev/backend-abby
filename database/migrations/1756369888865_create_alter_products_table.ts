import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('brand_id')
        .unsigned()
        .nullable()
        .references('brands.id')
        .onDelete('cascade')
        .onUpdate('cascade')
      table
        .integer('persona_id')
        .unsigned()
        .nullable()
        .references('personas.id')
        .onDelete('cascade')
        .onUpdate('cascade')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['brand_id'])
      table.dropColumn('brand_id')

      table.dropForeign(['persona_id'])
      table.dropColumn('persona_id')
    })
  }
}
